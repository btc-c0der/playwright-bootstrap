#!/usr/bin/env node
import path from "node:path";
import { access } from "node:fs/promises";
import { parseArgs } from "node:util";
import { copyTemplate } from "./copy-template.js";
import { tokenizeDirectory } from "./tokenize.js";
import { answersFromFlags, promptForAnswers, type CliFlags } from "./prompts.js";
import { pinFrameworkVersions, runPostinstallSteps } from "./postinstall.js";

async function dirExists(dir: string): Promise<boolean> {
  try {
    await access(dir);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      org: { type: "string" },
      "base-url": { type: "string" },
      projects: { type: "string" },
      pm: { type: "string" },
      yes: { type: "boolean", default: false },
      "no-install": { type: "boolean", default: false },
      "no-git": { type: "boolean", default: false },
    },
  });

  const flags: CliFlags = {
    projectName: positionals[0],
    org: values.org,
    baseUrl: values["base-url"],
    projects: values.projects,
    pm: values.pm,
    yes: values.yes,
    noInstall: values["no-install"],
    noGit: values["no-git"],
  };

  const answers = flags.yes ? answersFromFlags(flags) : await promptForAnswers(flags);
  const targetDir = path.resolve(process.cwd(), answers.projectName);
  // `answers.projectName` is whatever the user typed — a bare name, or a
  // relative/absolute path. The token embedded in package.json etc. should
  // always be a plain project name, so derive it from the resolved target
  // directory's basename rather than echoing a raw path into `{{PROJECT_NAME}}`.
  const projectName = path.basename(targetDir);

  if (await dirExists(targetDir)) {
    process.stderr.write(`Refusing to scaffold into existing path: ${targetDir}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`\nScaffolding ${projectName} into ${targetDir}...\n`);
  await copyTemplate(targetDir);
  await tokenizeDirectory(targetDir, {
    PROJECT_NAME: projectName,
    ORG_SCOPE: answers.orgScope,
    APP_BASE_URL: answers.baseUrl,
    PKG_MANAGER: answers.packageManager,
    CURRENT_YEAR: String(new Date().getUTCFullYear()),
  });
  await pinFrameworkVersions(targetDir);
  await runPostinstallSteps(targetDir, answers);

  process.stdout.write(
    `\nDone. Next steps:\n  cd ${answers.projectName}\n` +
      (answers.install ? "" : `  ${answers.packageManager} install\n`) +
      `  ${answers.packageManager} test\n\n` +
      "See docs/architecture.md for a tour of what was generated.\n",
  );
}

main().catch((error) => {
  process.stderr.write(`create-qaf failed: ${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
