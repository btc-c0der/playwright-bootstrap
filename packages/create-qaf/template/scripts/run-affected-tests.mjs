// Used by .husky/pre-push. Runs only the spec files that changed relative to
// main (or the previous commit if main isn't reachable, e.g. shallow clones) —
// a full sharded run belongs in CI, not on every push from a laptop.
import { execSync } from "node:child_process";

function changedFiles() {
  const bases = ["origin/main...HEAD", "HEAD~1...HEAD"];
  for (const base of bases) {
    try {
      const output = execSync(`git diff --name-only ${base}`, { encoding: "utf-8" });
      return output.split("\n").filter(Boolean);
    } catch {
      continue;
    }
  }
  return [];
}

const changedSpecs = changedFiles().filter(
  (file) => file.startsWith("tests/") && /\.spec\.ts$/.test(file),
);

if (changedSpecs.length === 0) {
  process.stdout.write("No changed spec files — skipping pre-push test run.\n");
  process.exit(0);
}

process.stdout.write(`Running ${changedSpecs.length} affected spec file(s):\n${changedSpecs.join("\n")}\n`);
execSync(`npx playwright test ${changedSpecs.map((f) => `"${f}"`).join(" ")}`, { stdio: "inherit" });
