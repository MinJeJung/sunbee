import { access, copyFile, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const target = path.resolve(process.env.EBOOK_STATE_PATH || path.join(process.cwd(), "data", "state.json"));
const state = JSON.parse(await readFile(target, "utf8"));
let updated = 0;

const operations = await Promise.all(state.operations.map(async (operation) => {
  if (!operation.artifact?.epubArtifactId) return operation;
  const bookDirectory = operation.bookDirectory || path.dirname(path.resolve(operation.artifact.epubArtifactId));
  const metaPath = operation.metaPath || path.join(bookDirectory, "_meta.md");
  const metadataState = await access(metaPath).then(() => "ready", () => "missing");
  if (operation.bookDirectory !== bookDirectory || operation.metaPath !== metaPath || operation.metadataState !== metadataState) updated += 1;
  return { ...operation, bookDirectory, metaPath, metadataState };
}));

if (updated > 0) {
  await copyFile(target, `${target}.pre-path-migration`);
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify({ ...state, operations }, null, 2), "utf8");
  await rename(temporary, target);
}

console.log(JSON.stringify({ target, operations: operations.length, updated }));
