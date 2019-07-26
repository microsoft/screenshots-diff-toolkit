export type Viewport = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
};

export type TestInformation = {
  readonly name: string;
  readonly environment: string;
  readonly viewport: Viewport;
};

export type TestRunResult = {
  readonly diffId: number,
  readonly imageName: string,
  readonly mismatchedPixels: number
  /*
  readonly imageName: string;
  readonly diffId: number;
  readonly screenshotName: string;
  readonly baselineVersion: string;
  readonly candidateVersion: string;
  readonly workloadName: string;
  readonly mismatchedPixels: number;
  readonly filename: string;
  readonly rating: number;
*/
};
