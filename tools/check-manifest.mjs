// module.json in step with itself, before a release: the id and title the family expects, the
// `download` URL naming the `version`'s tag, every `esmodules` entry on disk, and the manifest
// URL in the shape every world installs from. Read-only; exits 1 on the first thing out of step.
//
//   node tools/check-manifest.mjs
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const ID = "fvtt-mod-tokenart";
const manifest = JSON.parse(readFileSync(join(REPO, "module.json"), "utf8"));

const problems = [];
if (manifest.id !== ID) problems.push(`id is "${manifest.id}", expected "${ID}"`);
if (manifest.title !== "Open Roll 5e: Token Art") problems.push(`title is "${manifest.title}"`);
if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? "")) problems.push(`version "${manifest.version}" is not x.y.z`);
const download = `${manifest.url}/releases/download/v${manifest.version}/${ID}.zip`;
if (manifest.download !== download) problems.push(`download is\n    ${manifest.download}\n  expected\n    ${download}`);
const manifestUrl = `${manifest.url}/releases/latest/download/module.json`;
if (manifest.manifest !== manifestUrl) problems.push(`manifest is ${manifest.manifest}, expected ${manifestUrl}`);
for (const file of manifest.esmodules ?? []) {
  if (!existsSync(join(REPO, file))) problems.push(`esmodule ${file} is not on disk`);
}
if (!manifest.compatibility?.minimum || !manifest.compatibility?.verified)
  problems.push("compatibility.minimum/verified missing");

if (problems.length) {
  console.error(`module.json is OUT OF STEP:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`module.json is in step: ${ID} ${manifest.version}, download names v${manifest.version}.`);
