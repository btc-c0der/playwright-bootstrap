import prompts from "prompts";

export interface ScaffoldAnswers {
  projectName: string;
  orgScope: string;
  baseUrl: string;
  projects: Array<"web" | "api" | "mobile">;
  packageManager: "pnpm" | "npm" | "yarn";
  install: boolean;
  gitInit: boolean;
  husky: boolean;
}

export interface CliFlags {
  projectName?: string;
  org?: string;
  baseUrl?: string;
  projects?: string;
  pm?: string;
  yes?: boolean;
  noInstall?: boolean;
  noGit?: boolean;
}

const DEFAULTS: ScaffoldAnswers = {
  projectName: "my-qa-suite",
  orgScope: "my-org",
  baseUrl: "http://localhost:3000",
  projects: ["web", "api", "mobile"],
  packageManager: "pnpm",
  install: true,
  gitInit: true,
  husky: true,
};

/** Non-interactive path (`--yes`) fills every answer from flags/defaults — used for scripted/CI scaffolding. */
export function answersFromFlags(flags: CliFlags): ScaffoldAnswers {
  return {
    projectName: flags.projectName ?? DEFAULTS.projectName,
    orgScope: flags.org ?? DEFAULTS.orgScope,
    baseUrl: flags.baseUrl ?? DEFAULTS.baseUrl,
    projects: (flags.projects?.split(",").filter(Boolean) as ScaffoldAnswers["projects"]) ?? DEFAULTS.projects,
    packageManager: (flags.pm as ScaffoldAnswers["packageManager"]) ?? DEFAULTS.packageManager,
    install: !flags.noInstall,
    gitInit: !flags.noGit,
    husky: !flags.noInstall,
  };
}

export async function promptForAnswers(flags: CliFlags): Promise<ScaffoldAnswers> {
  const response = await prompts(
    [
      {
        type: flags.projectName ? null : "text",
        name: "projectName",
        message: "Project name (also the target directory)",
        initial: DEFAULTS.projectName,
      },
      {
        type: flags.org ? null : "text",
        name: "orgScope",
        message: "npm/GitHub org scope",
        initial: DEFAULTS.orgScope,
      },
      {
        type: flags.baseUrl ? null : "text",
        name: "baseUrl",
        message: "Base URL of the app under test",
        initial: DEFAULTS.baseUrl,
      },
      {
        type: flags.projects ? null : "multiselect",
        name: "projects",
        message: "Which test projects do you want?",
        choices: [
          { title: "Web UI", value: "web", selected: true },
          { title: "API / contract", value: "api", selected: true },
          { title: "Mobile web (device emulation)", value: "mobile", selected: true },
        ],
        min: 1,
      },
      {
        type: flags.pm ? null : "select",
        name: "packageManager",
        message: "Package manager",
        choices: [{ title: "pnpm", value: "pnpm" }, { title: "npm", value: "npm" }, { title: "yarn", value: "yarn" }],
        initial: 0,
      },
      {
        type: flags.noInstall ? null : "confirm",
        name: "install",
        message: "Install dependencies now?",
        initial: true,
      },
      {
        type: flags.noGit ? null : "confirm",
        name: "gitInit",
        message: "Initialize a git repository?",
        initial: true,
      },
    ],
    { onCancel: () => process.exit(1) },
  );

  return {
    projectName: flags.projectName ?? response.projectName ?? DEFAULTS.projectName,
    orgScope: flags.org ?? response.orgScope ?? DEFAULTS.orgScope,
    baseUrl: flags.baseUrl ?? response.baseUrl ?? DEFAULTS.baseUrl,
    projects: (flags.projects?.split(",").filter(Boolean) as ScaffoldAnswers["projects"]) ??
      response.projects ??
      DEFAULTS.projects,
    packageManager: (flags.pm as ScaffoldAnswers["packageManager"]) ??
      response.packageManager ??
      DEFAULTS.packageManager,
    install: flags.noInstall ? false : (response.install ?? true),
    gitInit: flags.noGit ? false : (response.gitInit ?? true),
    husky: !flags.noInstall,
  };
}
