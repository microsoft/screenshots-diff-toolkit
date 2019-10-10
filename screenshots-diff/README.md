Designed for end to end and visual regression testing at scale, **screenshots-diff** is a small and fast JavaScript image comparison package that produces side by side screenshots diff.

These diff images are like a Git diffs at the pixel level with the screenshot before and after on each side of the abolute diff with a green and red filter highlighting the changes.

Most image diff packages only output the absolute diff between two images whithout any context. Adding the side by side view and filters is a significant addition that contextualizes the changes and make the diff images directly actionnable.

Screenshots are diffed at the Uint32Array level, checking and filtering RGBA values at once in parallel on all available CPU cores to further speed up the process.

## License and dependencies

This package is under MIT license.

It depends on PNGjs which is under MIT license, and JPEG-JS which is under BSD 3-clause and builds on top of JPGJS which is licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

## Command line

screenshots-diff comes with an example showing how to consume the package from command line:

```bash
node screenshots-diff-example baseline-folder/ candidate_folder/ output_folder/ 0.03
```

## Example usage

### Node.js

```typescript
import diffScreenshots from "./index";
import { FormattedResults} from "./types";

diffScreenshots(baselinePath, candidatePath, diffPath, threshold)
  .then((result: FormattedResults | void) => {
    if (result !== void) {
      console.log(JSON.stringify(result, null, 1));
    }
  })
  .catch(err => {
    logError(`** ERROR ** ${err}`);
  });
```