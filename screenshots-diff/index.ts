import * as child_process from "child_process";
import * as fs from "fs";
import { sep, join } from "path";
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
import {
  TestRunResult,
  FormattedResults,
  MISSING_BASELINE,
  MISSING_CANDIDATE
} from "./types";
const NUMBER_OF_CORES = require("os").cpus().length;
const DEFAULT_THRESHOLD = 0.03;

let countProcessed = 0;
let countChanged = 0;
let countAdded = 0;
let countRemoved = 0;
let countUnchanged = 0;

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
  const screenshotFileNames = getScreenshotFileNames(
    baselinePath,
    candidatePath
  );
  const countImages = screenshotFileNames.length;

  let screenshotFileNameIndex = 0;
  const screenshotsAdded: string[] = [];
  const screenshotsRemoved: string[] = [];
  const screenshotsUnchanged: string[] = [];
  const screenshotsChanged: TestRunResult[] = [];

  const diffImages = async (
    diffImagesAsyncProcess?: child_process.ChildProcess
  ) => {
    while (screenshotFileNameIndex < countImages) {
      const imageName = screenshotFileNames[screenshotFileNameIndex++];
      const diffImageName = imageName.replace(/\.jpg$/, ".png");
      const diffImagePath = `${diffPath}${sep}${diffImageName}`;
      const options = {
        baselineImagePath: `${baselinePath}${sep}${imageName}`,
        candidateImagePath: `${candidatePath}${sep}${imageName}`,
        diffImagePath,
        threshold
      };
      const msg:
        | { mismatchedPixels: number; diffHash: number }
        | undefined = diffImagesAsyncProcess
        ? await new Promise(resolveAfterThisImage => {
            // Listen to message ONCE to resolveAfterThisImage
            diffImagesAsyncProcess.once(
              "message",
              (msg?: { mismatchedPixels: number; diffHash: number }) =>
                resolveAfterThisImage(msg)
            );
            // Send message to the diffImagesAsyncProcess for this image
            diffImagesAsyncProcess.send(options);
          })
        : await diffImagesAsync(options);

      // Push the result if we got a message back
      if (msg !== undefined) {
        const mismatchedPixels = msg.mismatchedPixels;
        const diffHash = msg.diffHash;
        updateProgressReport(mismatchedPixels, countImages);
        if (mismatchedPixels === 0) {
          screenshotsUnchanged.push(imageName);
        } else if (mismatchedPixels === MISSING_BASELINE) {
          screenshotsAdded.push(imageName);
        } else if (mismatchedPixels === MISSING_CANDIDATE) {
          screenshotsRemoved.push(imageName);
        } else {
          screenshotsChanged.push({
            imageName: diffImageName,
            mismatchedPixels,
            diffHash
          });
        }
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
    const diffImagesAsyncProcesses: child_process.ChildProcess[] = []
    logInfo(`Diffing images using ${NUMBER_OF_CORES} processes`);
    const nodeLocation = process.argv[0];
    for (let i = 0; i < NUMBER_OF_CORES; i++) {
      diffImagesAsyncProcesses.push(
        child_process.spawn(nodeLocation, [join(__dirname, "diffImagesAsync.js")], { stdio: ["pipe", "pipe", "pipe", "ipc"] })
      );
    }

    await Promise.all(diffImagesAsyncProcesses.map(diffImages));
  }

  if (screenshotsUnchanged.length === 0) {
    logError(
      highlight(
        "  The tests didn't seem to run.\n  See previous errors for more context"
      )
    );
  } else {
    const foundVisibleDifferences = screenshotsUnchanged.length < countImages;
    const message = foundVisibleDifferences
      ? `Alright, there was ${screenshotsAdded.length} screenshots added, ${screenshotsRemoved.length} removed, ${screenshotsUnchanged.length} unchanged and ${screenshotsChanged.length} with visible differences. But are they regressions or expected changes ?`
      : "Great! There are no visible difference between the two sets of screenshots.";

    const formatedResults = formatAndStoreResults(
      baselinePath,
      candidatePath,
      diffPath,
      countImages,
      screenshotsAdded,
      screenshotsRemoved,
      screenshotsChanged,
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
  const screenshotFileNamesBaseline = fs
    .readdirSync(baselinePath)
    .filter(filterOutAnythingButScreenshots);
  const screenshotFileNamesCandidate = fs
    .readdirSync(candidatePath)
    .filter(filterOutAnythingButScreenshots);

  const fileNames = Array.from(
    new Set(screenshotFileNamesBaseline.concat(screenshotFileNamesCandidate))
  );

  if (
    screenshotFileNamesBaseline.length > 0 &&
    screenshotFileNamesCandidate.length > 0
  ) {
    log(`Found ${fileNames.length} unique PNG and JPG file names.`);
    return fileNames;
  }

  const errorMessages: string[] = [];
  if (screenshotFileNamesBaseline.length === 0) {
    errorMessages.push(`  No PNG or JPG images found in ${baselinePath}`);
  }
  if (screenshotFileNamesCandidate.length === 0) {
    errorMessages.push(`  No PNG or JPG images found in ${candidatePath}`);
  }

  logError(highlight(`\n${errorMessages.join("\n")}\n`));
  return fileNames;
};

const filterOutAnythingButScreenshots = (filename: string): boolean =>
  filename.endsWith(".png") || filename.endsWith(".jpg");

const updateProgressReport = (mismatchedPixels: number, count: number) => {
  if (mismatchedPixels === MISSING_BASELINE) {
    countAdded++;
  } else if (mismatchedPixels === MISSING_CANDIDATE) {
    countRemoved++;
  } else if (mismatchedPixels !== 0) {
    countChanged++;
  } else {
    countUnchanged++;
  }

  countProcessed++;
  log(
    `${ANSI_ESCAPES.escape}1A${ANSI_ESCAPES.clearLine}Processed ${countProcessed}/${count}\t// ${countUnchanged} unchanged + ${countChanged} changed + ${countAdded} added + ${countRemoved} removed`
  );
};

const formatAndStoreResults = (
  baselinePath: string,
  candidatePath: string,
  diffPath: string,
  totalScreenshotsCount: number,
  screenshotsAdded: string[],
  screenshotsRemoved: string[],
  screenshotsChanged: TestRunResult[],
  message: string
): FormattedResults | void => {
  const filePath = `${diffPath}${sep}diff.json`;
  try {
    const formattedResults = {
      version: "0.0.2",
      message,
      baselinePath,
      candidatePath,
      diffPath,
      totalScreenshotsCount,
      screenshotsAdded,
      screenshotsRemoved,
      screenshotsChanged
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
