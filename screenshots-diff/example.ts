import diffScreenshots from "./index";
import { logError } from "./log";

const args = process.argv.slice(2);
const paths = {
  baseline: args[0],
  candidate: args[1],
  diff: args[2]
};
const threshold = parseFloat(args[3]);

const isInvalidArgs = args.length !== 4 || isNaN(threshold) || threshold < 0 || threshold > 1;
if (isInvalidArgs) {
  logError(
    "You must provide 4 arguments: baseline_path candidate_path result_path threshold where threshold is between 0 and 1"
  );
  process.exit();
}

diffScreenshots(paths.baseline, paths.candidate, paths.diff, threshold).catch(
  err => {
    logError(`** ERROR ** ${err}`);
  }
);
