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

  // Get the list of unique PNG file names
  const pngFileNames = getPngFileNames(baselinePath, candidatePath);
  const countImages = pngFileNames.length;
  if (countImages > 0) {
    // Store cursor position to update the progress in the console
    console.log(ANSI_ESCAPES.saveCursorPosition);
  }

  const testRunResults: TestRunResult[] = [];
  // Process all the images to get testRunResults
  if (useSingleThread) {
    // Process all the images using a single thread
    for(const imageName of pngFileNames) {
      const msg = await diffImagesAsync(
        `${baselinePath}${sep}${imageName}`,
        `${candidatePath}${sep}${imageName}`,
        `${diffPath}${sep}${imageName}`,
        threshold
      );
      // Push the testRunResult if we got a message back
      if (msg !== undefined) {
        testRunResults.push(
          createTestRunResultAndUpdateProgressReport(
            imageName,
            msg.mismatchedPixels,
            countImages
          )
        );
      }
    }
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

    let pngFileNameIndex = 0;
    await Promise.all(
      diffImagesAsyncProcesses.map(async diffImagesAsyncProcess => {
        while (pngFileNameIndex < countImages) {
          const imageName = pngFileNames[pngFileNameIndex++];
          await new Promise(resolveAfterThisImage => {
            // Listen to message ONCE to resolveAfterThisImage
            diffImagesAsyncProcess.once(
              "message",
              (msg?: { mismatchedPixels: number }) => {
                // Push the testRunResult if we got a message back
                if (msg !== undefined) {
                  testRunResults.push(
                    createTestRunResultAndUpdateProgressReport(
                      imageName,
                      msg.mismatchedPixels,
                      countImages
                    )
                  );
                }
                resolveAfterThisImage();
              }
            );
            // Send message to the diffImagesAsyncProcess for this image
            diffImagesAsyncProcess.send({
              baselineImagePath: `${baselinePath}${sep}${imageName}`,
              candidateImagePath: `${candidatePath}${sep}${imageName}`,
              diffImagePath: `${diffPath}${sep}${imageName}`,
              threshold
            });
          });
        }
        diffImagesAsyncProcess.kill();
      })
    );
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

const getPngFileNames = (
  baselinePath: string,
  candidatePath: string
): string[] => {
  const pngFileNamesBaseline = fs
    .readdirSync(baselinePath)
    .filter(filterOutAnythingButPngs);
  const pngFileNamesCandidate = fs
    .readdirSync(candidatePath)
    .filter(filterOutAnythingButPngs);
  const pngFileNames = Array.from(
    new Set(pngFileNamesBaseline.concat(pngFileNamesCandidate))
  );

  if (pngFileNamesBaseline.length > 0 && pngFileNamesCandidate.length > 0) {
    log(`Found ${pngFileNames.length} unique PNG file names`);
    return Array.from(
      new Set(pngFileNamesBaseline.concat(pngFileNamesCandidate))
    );
  }

  const errorMessages: string[] = [];
  if (pngFileNamesBaseline.length === 0) {
    errorMessages.push(
      `  No PNG images found in the baseline path: ${baselinePath}`
    );
  }
  if (pngFileNamesCandidate.length === 0) {
    errorMessages.push(
      `  No PNG images found in the candidate path: ${candidatePath}`
    );
  }

  logError(highlight(`\n${errorMessages.join("\n")}\n`));
  return [];
};

const filterOutAnythingButPngs = (filename: string): boolean =>
  filename.endsWith(".png");

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
