import * as child_process from "child_process";
import * as fs from "fs";
import { sep } from "path";
import { diffImagesAsync } from "./diffImagesAsync";
import {
  ANSI_ESCAPES,
  highlight,
  log,
  logError,
  logInfo,
  logSuccess,
  logWarning
} from "./log";
import { TestRunResult, FormattedResults } from "./types";
const NUMBER_OF_CORES = require("os").cpus().length;
const DEFAULT_THRESHOLD = 0.03;

let countProcessed = 0;
let countDifferent = 0;

export default async (
  baselinePath: string,
  candidatePath: string,
  diffPath: string,
  threshold: number,
  useSingleThread: boolean = false
): Promise<FormattedResults | void> => {
  // Ensure the paths exists
  const missingPaths: string[] = [];
  if (!fs.existsSync(baselinePath)) {
    missingPaths.push(baselinePath);
  }
  if (!fs.existsSync(candidatePath)) {
    missingPaths.push(candidatePath);
  }
  // First try to create the diff path if needed
  if (!fs.existsSync(diffPath)) {
    fs.mkdirSync(diffPath);
  }
  if (!fs.existsSync(diffPath)) {
    missingPaths.push(diffPath);
  }

  if (missingPaths.length > 0) {
    throw "The following paths do not exists:\n" + missingPaths.join("\n");
  }

  // Clamp the threshold
  threshold = Math.max(0, Math.min(1, threshold || DEFAULT_THRESHOLD));

  // Get the list of unique screenshot file names
  const screemshotFileNames = getScreenshotFileNames(
    baselinePath,
    candidatePath
  );
  const countImages = screemshotFileNames.length;
  if (countImages > 0) {
    // Store cursor position to update the progress in the console
    console.log(ANSI_ESCAPES.saveCursorPosition);
  }

  let screenshotFileNameIndex = 0;
  const testRunResults: TestRunResult[] = [];

  const diffImages = async (
    diffImagesAsyncProcess?: child_process.ChildProcess
  ) => {
    while (screenshotFileNameIndex < countImages) {
      const imageName = screemshotFileNames[screenshotFileNameIndex++];
      const diffImageName = imageName.replace(/\.jpg$/, ".png");
      const diffImagePath = `${diffPath}${sep}${diffImageName}`;
      const options = {
        baselineImagePath: `${baselinePath}${sep}${imageName}`,
        candidateImagePath: `${candidatePath}${sep}${imageName}`,
        diffImagePath,
        threshold
      };
      const msg:
        | { mismatchedPixels: number }
        | undefined = diffImagesAsyncProcess
        ? await new Promise(resolveAfterThisImage => {
            // Listen to message ONCE to resolveAfterThisImage
            diffImagesAsyncProcess.once(
              "message",
              (msg?: { mismatchedPixels: number }) => resolveAfterThisImage(msg)
            );
            // Send message to the diffImagesAsyncProcess for this image
            diffImagesAsyncProcess.send(options);
          })
        : await diffImagesAsync(options);

      // Push the testRunResult if we got a message back
      if (msg !== undefined) {
        testRunResults.push(
          createTestRunResultAndUpdateProgressReport(
            diffImageName,
            msg.mismatchedPixels,
            countImages
          )
        );
      }
    }

    if (diffImagesAsyncProcess) {
      diffImagesAsyncProcess.kill();
    }
  };

  // Process all the images to get testRunResults
  if (useSingleThread) {
    // Process all the images using a single thread
    await diffImages();
  } else {
    // create pool of diffImagesAsyncProcesses to process all the images
    const diffImagesAsyncProcesses: child_process.ChildProcess[] = [];
    for (let i = 0; i < NUMBER_OF_CORES; i++) {
      diffImagesAsyncProcesses.push(
        child_process.fork("./lib/diffImagesAsync", [], {
          silent: true
        })
      );
    }

    await Promise.all(diffImagesAsyncProcesses.map(diffImages));
  }

  if (testRunResults.length === 0) {
    logError(
      highlight(
        "  The tests didn't seem to run.\n  See previous errors for more context"
      )
    );
  } else {
    // Filter out testRunResults with no mismatched pixels
    const filteredTestRunResults = testRunResults.filter(
      testRunResult => testRunResult.mismatchedPixels !== 0
    );
    const foundVisibleDifferences = filteredTestRunResults.length > 0;
    const message = foundVisibleDifferences
      ? "Alright, there are some visible difference. But are they regressions or expected changes ?"
      : "Great! There are no visible difference between the two versions.";

    const formatedResults = formatAndStoreResults(
      baselinePath,
      candidatePath,
      diffPath,
      countImages,
      filteredTestRunResults,
      message
    );

    if (foundVisibleDifferences) {
      logWarning(highlight(message));
    } else {
      logSuccess(highlight(message));
    }
    return formatedResults;
  }

  return;
};

const getScreenshotFileNames = (
  baselinePath: string,
  candidatePath: string
): string[] => {
  const screemshotFileNamesBaseline = fs
    .readdirSync(baselinePath)
    .filter(filterOutAnythingButScreenshots);
  const screenshotFileNamesCandidate = fs
    .readdirSync(candidatePath)
    .filter(filterOutAnythingButScreenshots);
  const screenshotFileNames = Array.from(
    new Set(screemshotFileNamesBaseline.concat(screenshotFileNamesCandidate))
  );

  if (
    screemshotFileNamesBaseline.length > 0 &&
    screenshotFileNamesCandidate.length > 0
  ) {
    log(`Found ${screenshotFileNames.length} unique PNG and JPG file names`);
    return Array.from(
      new Set(screemshotFileNamesBaseline.concat(screenshotFileNamesCandidate))
    );
  }

  const errorMessages: string[] = [];
  if (screemshotFileNamesBaseline.length === 0) {
    errorMessages.push(`  No PNG or JPG images found in ${baselinePath}`);
  }
  if (screenshotFileNamesCandidate.length === 0) {
    errorMessages.push(`  No PNG or JPG images found in ${candidatePath}`);
  }

  logError(highlight(`\n${errorMessages.join("\n")}\n`));
  return [];
};

const filterOutAnythingButScreenshots = (filename: string): boolean =>
  filename.endsWith(".png") || filename.endsWith(".jpg");

const createTestRunResultAndUpdateProgressReport = (
  imageName: string,
  mismatchedPixels: number,
  count: number
): TestRunResult => {
  if (mismatchedPixels !== 0) {
    countDifferent++;
  }
  log(
    ANSI_ESCAPES.restoreCursorPosition +
      `Processed ${countProcessed +
        1}/${count} incl. ${countDifferent} different`
  );
  countProcessed++;

  return {
    imageName,
    mismatchedPixels
  };
};

const formatAndStoreResults = (
  baselinePath: string,
  candidatePath: string,
  diffPath: string,
  totalImagesCount: number,
  differentImages: TestRunResult[],
  message: string
): FormattedResults | void => {
  const filePath = `${diffPath}${sep}diff.json`;
  try {
    const formattedResults = {
      version: "0.0.1",
      message,
      baselinePath,
      candidatePath,
      diffPath,
      totalImagesCount,
      differentImages
    };
    fs.writeFileSync(filePath, JSON.stringify(formattedResults), {
      encoding: "utf8"
    });
    logInfo(`Test run results saved as ${filePath}`);
    return formattedResults;
  } catch (err) {
    logError(`Could not save test run results as ${filePath}\n${err}`);
  }
  return;
};
