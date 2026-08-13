// Bundles the modules under test into plain ESM that `node --test` can import.
//
// The plugin itself builds to CJS against Obsidian's runtime, which is not
// available outside the app, so the Obsidian import is redirected to a stub.
// Nothing here touches the shipped main.js build.
import esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));

for (const name of ["scripture", "settings"]) {
  await esbuild.build({
    entryPoints: [path.join(root, `src/${name}.ts`)],
    outfile: path.join(root, `tests/.build/${name}.mjs`),
    bundle: true,
    format: "esm",
    platform: "node",
    target: "es2020",
    logLevel: "warning",
    alias: {
      obsidian: path.join(root, "tests/obsidian-stub.mjs"),
    },
  });
}
