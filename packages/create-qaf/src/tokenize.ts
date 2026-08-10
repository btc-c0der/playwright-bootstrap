import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

export interface TokenValues {
  PROJECT_NAME: string;
  ORG_SCOPE: string;
  APP_BASE_URL: string;
  PKG_MANAGER: string;
  CURRENT_YEAR: string;
}

const BINARY_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2"]);

/** Recursively replaces `{{TOKEN}}` in every non-binary file under `dir`. */
export async function tokenizeDirectory(dir: string, values: TokenValues): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await tokenizeDirectory(fullPath, values);
      continue;
    }
    if (BINARY_EXTENSIONS.has(path.extname(entry.name))) continue;

    const stats = await stat(fullPath);
    if (stats.size > 2 * 1024 * 1024) continue; // skip anything unexpectedly large

    const content = await readFile(fullPath, "utf-8");
    const replaced = content.replace(/\{\{(\w+)\}\}/g, (match, token: string) => {
      return token in values ? values[token as keyof TokenValues] : match;
    });
    if (replaced !== content) {
      await writeFile(fullPath, replaced, "utf-8");
    }
  }
}
