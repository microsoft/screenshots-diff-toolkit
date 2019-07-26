export type Viewport = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
};

export type TestInformation = {
  readonly name: string;
  readonly viewport: Viewport;
};

export type TestRunResult = {
  readonly imageName: string,
  readonly mismatchedPixels: number
};
