import * as fs from "fs";
import { PNG } from "pngjs";
import { TestInformation } from "./types";

declare type ImageAndTestInformation = {
  image?: PNG;
  info?: TestInformation;
};

const COLOR_COMPONENTS = 4; /* for the RGBA components */
const DEFAULT_THRESHOLD = 0.03; /* Allow small color difference to cater for antialiasing differences and slow opacity fade */
//const BRIGHTNESS_DIFFERENCE_THRESHOLD = 255 * DEFAULT_THRESHOLD;
const COLOR_HIGHLIGHT_ABGR = 0xff0000ff;

const getImageFileNameFromPath = (imagePath: string) => {
  return imagePath.replace(/^.*\//, "");
};

const getImageAndTestInformation = (
  imagePath: string
): ImageAndTestInformation => {
  const imageAndTestInformation: ImageAndTestInformation = {};
  if (fs.existsSync(imagePath)) {
    const jsonPath = imagePath.replace(/\.png$/i, ".json");
    if (fs.existsSync(jsonPath)) {
      imageAndTestInformation.info = JSON.parse(
        fs.readFileSync(jsonPath, { encoding: "utf-8" })
      ) as TestInformation;
    }

    const buffer = fs.readFileSync(imagePath);

    imageAndTestInformation.image = PNG.sync.read(buffer);

    if (!imageAndTestInformation.info) {
      const imageFileName = getImageFileNameFromPath(imagePath);
      imageAndTestInformation.info = {
        name: imageFileName,
        viewport: {
          x: 0,
          y: 0,
          width: imageAndTestInformation.image.width,
          height: imageAndTestInformation.image.height,
          scale: 1
        }
      };
    }
  }

  return imageAndTestInformation;
};

export const diffImagesAsync = async (
  baselineImagePath: string,
  candidateImagePath: string,
  diffImagePath: string,
  threshold: number
): Promise<{ mismatchedPixels: number } | undefined> => {
  const baseline = getImageAndTestInformation(baselineImagePath);
  const candidate = getImageAndTestInformation(candidateImagePath);

  const BRIGHTNESS_DIFFERENCE_THRESHOLD = 255 * Math.min(1, Math.max(0, threshold || DEFAULT_THRESHOLD));
  // Skip if there are no valid images or the workload isn't in the config
  if (baseline.image === undefined && candidate.image === undefined) {
    return Promise.resolve(undefined);
  }

  let width = 0,
    height = 0,
    imagesCount = 0,
    baselineData: null | Uint8Array = null,
    candidateData: null | Uint8Array = null,
    baselineData32: null | Uint32Array = null,
    candidateData32: null | Uint32Array = null,
    baselineOffset32 = 0,
    candidateOffset32 = 0,
    baselineOffsetIncrement32 = 0,
    candidateOffsetIncrement32 = 0;

  // Prepare baseline buffers, offset, increment, ... and diff width, height, ...
  if (baseline.image && baseline.info) {
    imagesCount++;
    width = baseline.info.viewport.width;
    height = baseline.info.viewport.height;

    baselineData = new Uint8Array(baseline.image.data.buffer);
    baselineData32 = new Uint32Array(baselineData.buffer);
    baselineOffset32 =
      baseline.info.viewport.x +
      baseline.info.viewport.y * baseline.image.width;
    baselineOffsetIncrement32 = baseline.image.width;
  }

  // Prepare candidate buffers, offset, increment, ... and diff width, height, ...
  if (candidate.image && candidate.info) {
    imagesCount++;
    width = Math.max(width, candidate.info.viewport.width);
    height = Math.max(height, candidate.info.viewport.height);

    candidateData = new Uint8Array(candidate.image.data.buffer);
    candidateData32 = new Uint32Array(candidateData.buffer);
    candidateOffset32 =
      candidate.info.viewport.x +
      candidate.info.viewport.y * candidate.image.width;
    candidateOffsetIncrement32 = candidate.image.width;
  }

  // Prepare diff image, buffers, ...
  const diff = new PNG({ width: width * 3, height: height });
  const diffData = diff.data;
  const diffData32 = new Uint32Array(diffData.buffer);
  const missingOneImage = imagesCount === 1;
  let mismatchedPixels = missingOneImage ? -width * 3 * height : 0;

  // Diff the images
  for (let y = 0; y < height; y++) {
    let indexDiff32 = y * width * 3 + width;

    // Missing one image? -> highlight the whole diff line
    if (missingOneImage) {
      diffData32.fill(COLOR_HIGHLIGHT_ABGR, indexDiff32, indexDiff32 + width);
    }

    // Copy the baseline line on the left if available
    if (
      baselineData32 !== null &&
      baselineOffset32 <= baselineData32.length - width
    ) {
      diffData32.set(
        new Uint32Array(
          baselineData32.buffer,
          baselineOffset32 * COLOR_COMPONENTS,
          width
        ),
        indexDiff32 - width
      );
      baselineOffset32 += baselineOffsetIncrement32;
    }

    // Copy the candidate line on the right if available
    if (
      candidateData32 !== null &&
      candidateOffset32 <= candidateData32.length - width
    ) {
      diffData32.set(
        new Uint32Array(
          candidateData32.buffer,
          candidateOffset32 * COLOR_COMPONENTS,
          width
        ),
        indexDiff32 + width
      );
      candidateOffset32 += candidateOffsetIncrement32;
    }

    // Diff the pixels on that line if both images are available
    if (baselineData !== null && candidateData !== null) {
      let bIndex8 = (indexDiff32 - width) * COLOR_COMPONENTS;
      let cIndex8 = (indexDiff32 + width) * COLOR_COMPONENTS;
      let differenceBrightness: number;

      // tslint:disable no-bitwise
      for (let x = 0; x < width; x++) {
        const bABGR = diffData32[indexDiff32 - width];
        const cABGR = diffData32[indexDiff32 + width];
        const bBGRShifted = (bABGR >> 3) & 0x001f1f1f;

        if (bABGR === cABGR) {
          differenceBrightness = 0;
        } else {
          /*
           * Compute the difference of brightness between the baseline and candidate
           * using the [.299, .587, .114] brightness coefficients for the [red, green, blue] components according to
           * RGB to YIQ conversion algorithm used by the W3C color contrast and accessibility guidelines
           */
          differenceBrightness =
            0.299 * Math.abs(diffData[bIndex8 + 1] - diffData[cIndex8 + 1]) +
            0.587 * Math.abs(diffData[bIndex8 + 2] - diffData[cIndex8 + 2]) +
            0.114 * Math.abs(diffData[bIndex8 + 3] - diffData[cIndex8 + 3]);
        }

        // Output the difference between the baseline and candidate
        if (differenceBrightness < BRIGHTNESS_DIFFERENCE_THRESHOLD) {
          // Below the threshold -> no filter and washed out diff
          diffData32[indexDiff32] = bBGRShifted | 0xffe0e0e0;
        } else {
          // Above the threshold -> red/green filter and red diff
          mismatchedPixels++;
          diffData32[indexDiff32] = COLOR_HIGHLIGHT_ABGR;

          if ((x + y) & 1) {
            // Output the baseline pixel with green filter to show additions in the candidate
            if (cABGR !== 0xffffffff) {
              diffData32[indexDiff32 - width] = bBGRShifted | 0xff60e060;
            }
            // Output the candidate pixel with red filter to show deletions from the baseline
            if (bABGR !== 0xffffffff) {
              const cBGRShifted = (cABGR >> 3) & 0x001f1f1f;
              diffData32[indexDiff32 + width] = cBGRShifted | 0xff6060e0;
            }
          }
        }
        bIndex8 += COLOR_COMPONENTS;
        cIndex8 += COLOR_COMPONENTS;
        indexDiff32++;
      }
      // tslint:enable no-bitwise
    }
  }

  if (mismatchedPixels>0) {
    const buffer = PNG.sync.write(diff);
    fs.writeFileSync(diffImagePath, buffer);
  }

  return Promise.resolve({ mismatchedPixels });
};

process.on("message", async msg => {
  const baselineImagePath = `${msg.baselineImagePath}`;
  const candidateImagePath = `${msg.candidateImagePath}`;
  const diffImagePath = `${msg.diffImagePath}`;
  const threshold = msg.threshold;

  const diffResult = await diffImagesAsync(
    baselineImagePath,
    candidateImagePath,
    diffImagePath,
    threshold
  );

  if (process.send) {
    process.send(diffResult);
  }
});
