export type TestInformation = {
  readonly name: string;
  readonly viewport: Viewport;
};

export type Viewport = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
};

// Use fractional count of mismatched pixels to flag missing screenshots on either side
export const MISSING_BASELINE = -0.5;
export const MISSING_CANDIDATE = 0.5;

export type TestRunResult = {
  readonly imageName: string;
  readonly mismatchedPixels: number;
};

export type FormattedResults = {
  readonly version: string;
  readonly message: string;
  readonly baselinePath: string;
  readonly candidatePath: string;
  readonly diffPath: string;
  readonly totalScreenshotsCount: number;
  readonly screenshotsAdded: string[];
  readonly screenshotsRemoved: string[];
  readonly screenshotsChanged: TestRunResult[];
};
