import diffScreenshots from "./index";
import { logError } from "./log";

const args = process.argv.slice(2);
const paths = {
  baseline: args[0],
  candidate: args[1],
  diff: args[2]
};

if (args.length !== 3) {
  logError(
    "You must provide 3 arguments: baseline_path candidate_path result_path"
  );
  process.exit();
}

diffScreenshots(paths.baseline, paths.candidate, paths.diff).catch(err => {
  logError(`** ERROR ** ${err}`);
});
