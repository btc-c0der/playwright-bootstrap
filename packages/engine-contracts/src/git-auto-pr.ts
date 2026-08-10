import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface PatchFile {
  /** Repo-relative path this patch's contents should be written to. */
  path: string;
  contents: string;
}

export interface AutoPrRequest {
  title: string;
  body: string;
  branchName: string;
  /** Defaults to whatever the provider considers its trunk — `GhCliAutoPrProvider` defaults to `"main"`. */
  baseBranch?: string;
  patches: PatchFile[];
}

export interface AutoPrResult {
  opened: boolean;
  url?: string;
  branch?: string;
  /** Set when `opened` is false — why nothing was opened (no patches, provider not configured, command failure). */
  reason?: string;
}

/**
 * Pluggable, opt-in Git auto-PR backend — same posture as every other
 * provider in this monorepo (`AiRepairProvider`, `LLMProvider`,
 * `EmbeddingProvider`): a consuming repo wires a real implementation for its
 * own VCS (GitHub, Azure DevOps, GitLab); nothing here forces a token or API
 * dependency on a repo that doesn't want the self-healing engine to open PRs
 * automatically.
 */
export interface GitAutoPrProvider {
  openPr(request: AutoPrRequest): Promise<AutoPrResult>;
}

/** Default — reports what *would* have happened without touching the working tree or any remote. */
export class NoopGitAutoPrProvider implements GitAutoPrProvider {
  async openPr(request: AutoPrRequest): Promise<AutoPrResult> {
    return {
      opened: false,
      branch: request.branchName,
      reason: "No GitAutoPrProvider configured — see docs/self-healing-engine.md for wiring GhCliAutoPrProvider.",
    };
  }
}

export interface ShellExecutor {
  (command: string, args: string[]): Promise<{ stdout: string; stderr: string }>;
}

async function defaultShellExecutor(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args);
}

/**
 * Writes every patch to disk, commits on a fresh branch, and opens a PR via
 * the `gh` CLI — already the expected tool on a GitHub Actions runner
 * (`actions/checkout` + a token `gh` picks up from `GH_TOKEN`/`GITHUB_TOKEN`
 * is the only setup). Deliberately shells out rather than depending on
 * `@octokit/rest` — this package stays dependency-free by default, same
 * posture as `@qaf/rag-core`'s `LocalJsonlVectorStore` and `@qaf/graph-rag`'s
 * `Neo4jCompatibleGraphStore` (inject the real thing yourself).
 */
export class GhCliAutoPrProvider implements GitAutoPrProvider {
  constructor(private readonly exec: ShellExecutor = defaultShellExecutor) {}

  async openPr(request: AutoPrRequest): Promise<AutoPrResult> {
    if (request.patches.length === 0) {
      return { opened: false, branch: request.branchName, reason: "No patches to apply." };
    }

    try {
      await this.exec("git", ["checkout", "-b", request.branchName, request.baseBranch ?? "main"]);
      for (const patch of request.patches) {
        const dir = path.dirname(patch.path);
        if (dir && dir !== ".") await mkdir(dir, { recursive: true });
        await writeFile(patch.path, patch.contents, "utf-8");
        await this.exec("git", ["add", patch.path]);
      }
      await this.exec("git", ["commit", "-m", request.title]);
      await this.exec("git", ["push", "-u", "origin", request.branchName]);
      const { stdout } = await this.exec("gh", [
        "pr",
        "create",
        "--title",
        request.title,
        "--body",
        request.body,
        "--head",
        request.branchName,
      ]);
      return { opened: true, url: stdout.trim(), branch: request.branchName };
    } catch (error) {
      return {
        opened: false,
        branch: request.branchName,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
