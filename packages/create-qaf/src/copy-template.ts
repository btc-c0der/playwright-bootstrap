import { cp, readFile, rename, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATE_DIR = path.join(HERE, "..", "template");

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

async function loadIgnorePatterns(): Promise<RegExp[]> {
  const ignorePath = path.join(TEMPLATE_DIR, ".qafignore");
  try {
    const raw = await readFile(ignorePath, "utf-8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map(patternToRegExp);
  } catch {
    return [];
  }
}

export async function copyTemplate(targetDir: string): Promise<void> {
  const ignorePatterns = await loadIgnorePatterns();

  await cp(TEMPLATE_DIR, targetDir, {
    recursive: true,
    filter: (source) => {
      const rel = path.relative(TEMPLATE_DIR, source);
      if (rel === ".qafignore") return false;
      return !ignorePatterns.some((pattern) => pattern.test(rel));
    },
  });

  const tplPackageJson = path.join(targetDir, "package.json.tpl");
  try {
    await access(tplPackageJson);
    await rename(tplPackageJson, path.join(targetDir, "package.json"));
  } catch {
    // no .tpl present (already named package.json) — nothing to do
  }
}
