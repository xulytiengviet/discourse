import { Preprocessor } from "content-tag";
import { readFile, readdir } from "node:fs/promises";
const compiler = new Preprocessor();
for (const directory of [
  "assets/javascripts/discourse/components",
  "assets/javascripts/discourse/api-initializers",
]) {
  for (const filename of await readdir(directory)) {
    if (!filename.endsWith(".gjs")) {
      continue;
    }
    const path = `${directory}/${filename}`;
    compiler.process(await readFile(path, "utf8"), { filename: path });
    console.log(`Compiled ${path}`);
  }
}
