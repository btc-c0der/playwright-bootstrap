import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import type { ScaffoldAnswers } from "./prompts.js";

const require = createRequire(import.meta.url);

/**
 * create-qaf depends on @qaf/core and @qaf/eslint-plugin-qaf itself (workspace:*
 * in this monorepo, resolved to a real semver range on publish) purely so it can
 * read their *exact installed version* here and pin the same version into the
 * generated project — no registry lookup needed, and the scaffolded repo always
 * matches the CLI that generated it.
 */
function resolveInstalledVersion(pkgName: string): string {
  const pkgJsonPath = require.resolve(`${pkgName}/package.json`);
  const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as { version: string };
  return pkg.version;
}

export async function pinFrameworkVersions(targetDir: string): Promise<void> {
  const packageJsonPath = path.join(targetDir, "package.json");
  const raw = await readFile(packageJsonPath, "utf-8");
  const pkg = JSON.parse(raw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

  const coreVersion = resolveInstalledVersion("@qaf/core");
  const eslintVersion = resolveInstalledVersion("@qaf/eslint-plugin-qaf");

  pkg.dependencies = { ...pkg.dependencies, "@qaf/core": `^${coreVersion}` };
  pkg.devDependencies = { ...pkg.devDependencies, "@qaf/eslint-plugin-qaf": `^${eslintVersion}` };

  await writeFile(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
}

function run(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

export async function runPostinstallSteps(targetDir: string, answers: ScaffoldAnswers): Promise<void> {
  if (answers.install) {
    process.stdout.write(`\nInstalling dependencies with ${answers.packageManager}...\n`);
    run(answers.packageManager, ["install"], targetDir);

    process.stdout.write("\nInstalling Playwright browsers...\n");
    run("npx", ["playwright", "install", "--with-deps"], targetDir);

    if (answers.husky) {
      run(answers.packageManager === "npm" ? "npx" : answers.packageManager, ["exec", "husky"], targetDir);
    }
  }

  if (answers.gitInit) {
    process.stdout.write("\nInitializing git repository...\n");
    run("git", ["init"], targetDir);
    run("git", ["add", "-A"], targetDir);
    run("git", ["commit", "-m", "chore: scaffold from create-qaf"], targetDir);
  }
}
