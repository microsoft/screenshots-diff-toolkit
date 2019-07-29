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

export type TestRunResult = {
  readonly imageName: string,
  readonly mismatchedPixels: number
};

export type FormattedResults = {
  readonly version: string,
  readonly message: string,
  readonly baselinePath: string,
  readonly candidatePath: string,
  readonly diffPath: string,
  readonly totalImagesCount: number,
  readonly differentImages: TestRunResult[]
};