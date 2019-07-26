import * as child_process from "child_process";
import * as fs from "fs";
import {
  ANSI_ESCAPES,
  highlight,
  log,
  logError,
  logInfo,
  logSuccess,
  logWarning
} from "./log";
import { TestRunResult } from "./types";
const numberOfCores = require("os").cpus().length;

let diffScreenshotId = 0;
let countDifferent = 0;

export default async (
  baselinePath: string,
  candidatePath: string,
  diffPath: string
): Promise<void> => {
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
    throw("The following paths do not exists:\n" + missingPaths.join("\n"));
  }

  const pngFileNames = getPngFileNames(baselinePath, candidatePath);

  if (pngFileNames.length > 0) {
    // Store cursor position to update the progress in the console
    console.log(ANSI_ESCAPES.saveCursorPosition);
  }

  // create pool of diffImagesAsyncProcesses
  const diffImagesAsyncProcesses: child_process.ChildProcess[] = [];
  for (let i = 0; i < numberOfCores; i++) {
    diffImagesAsyncProcesses.push(
      child_process.fork("./lib/diffImagesAsync", [], {
        silent: true
      })
    );
  }

  // Process all the images to get testRunResults using all diffImagesAsyncProcesses
  let pngFileNameIndex = 0;
  const testRunResults: TestRunResult[] = [];
  await Promise.all(
    diffImagesAsyncProcesses.map(async diffImagesAsyncProcess => {
      while (pngFileNameIndex < pngFileNames.length) {
        const imageName = pngFileNames[pngFileNameIndex++];
        await new Promise(resolveAfterThisImage => {
          // Listen to message ONCE to resolveAfterThisImage
          diffImagesAsyncProcess.once(
            "message",
            (msg?: { mismatchedPixels: number; workloadName: string }) => {
              // Push the testRunResult if the the images were different
              if (msg !== undefined) {
                testRunResults.push(
                  createTestRunResultAndUpdateProgressReport(
                    imageName,
                    msg.mismatchedPixels,
                    pngFileNames.length
                  )
                );
              }
              resolveAfterThisImage();
            }
          );
          // Send message to the diffImagesAsyncProcess for this image
          diffImagesAsyncProcess.send({
            baselineImagePath: `${baselinePath}/${imageName}`,
            candidateImagePath: `${candidatePath}/${imageName}`,
            diffImagePath: `${diffPath}/${imageName}`
          });
        });
      }
      diffImagesAsyncProcess.kill();
    })
  );

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

    storeTestRunResults(
      baselinePath,
      candidatePath,
      diffPath,
      filteredTestRunResults,
      message
    );

    if (foundVisibleDifferences) {
      logWarning(highlight(message));
    } else {
      logSuccess(highlight(message));
    }
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
      `Processed ${diffScreenshotId +
        1}/${count} incl. ${countDifferent} different`
  );
  diffScreenshotId++;

  return {
    diffId: diffScreenshotId,
    imageName,
    mismatchedPixels
  };
};

const storeTestRunResults = (
  baselinePath: string,
  candidatePath: string,
  diffPath: string,
  testRunResults: TestRunResult[],
  message: string
): void => {
  const filePath = `${diffPath}/diff.json`;
  try {
    const runData = {
      version: "0.0.1",
      message,
      baselinePath,
      candidatePath,
      diffPath,
      testRunResults
    };
    fs.writeFileSync(filePath, JSON.stringify(runData), { encoding: "utf8" });
    logInfo(`Test run results saved as ${filePath}`);
  } catch (err) {
    logError(`Could not save test run results as ${filePath}\n${err}`);
  }
};
