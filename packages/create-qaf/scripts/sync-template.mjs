// Copies the repo-root `template/` into this package before build/pack, since
// `npm pack` can only include files inside the package directory — the canonical
// template lives at the monorepo root so it's easy to find/edit, not duplicated.
import { cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(packageDir, "..", "..", "template");
const dest = path.join(packageDir, "template");

await rm(dest, { recursive: true, force: true });
await cp(source, dest, { recursive: true });

process.stdout.write(`Synced template/ -> ${dest}\n`);
