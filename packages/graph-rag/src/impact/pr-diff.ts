import { parseNodeRef } from "../graph/types.js";
import type { GraphNode } from "../graph/types.js";

export interface ResolvedChangedRefs {
  nodeIds: string[];
  /** A changed ref that resolved to nothing — surfaced instead of silently dropped, since a PR touching an undeclared service means the graph is stale, not that the PR has zero impact. */
  unresolved: string[];
}

/**
 * Turns a PR's raw signal — an explicit node ref (`"service:orders-service"`,
 * `"endpoint:orders-service:POST /orders"`) or a changed file path — into the
 * seed node ids `impact/traversal.ts` starts its BFS from. File paths are
 * matched against `metadata.sourceFile` (recorded by
 * `ingestOpenApiContracts`/`ingestAsyncApiContracts`/`ingestTestCatalog`),
 * either exact or as a prefix (so `"services/orders/"` matches every node
 * whose source file is under that directory).
 */
export function resolveChangedRefs(allNodes: GraphNode[], changed: string[]): ResolvedChangedRefs {
  const nodesById = new Map(allNodes.map((n) => [n.id, n]));
  const nodeIds = new Set<string>();
  const unresolved: string[] = [];

  for (const ref of changed) {
    const parsed = parseNodeRef(ref);
    if (parsed && nodesById.has(parsed.id)) {
      nodeIds.add(parsed.id);
      continue;
    }

    const matches = allNodes.filter((n) => matchesSourceFile(n, ref));
    if (matches.length === 0) {
      unresolved.push(ref);
      continue;
    }
    for (const match of matches) nodeIds.add(match.id);
  }

  return { nodeIds: [...nodeIds], unresolved };
}

function matchesSourceFile(node: GraphNode, changedPath: string): boolean {
  const sourceFile = node.metadata.sourceFile;
  if (typeof sourceFile !== "string") return false;
  return sourceFile === changedPath || sourceFile.startsWith(changedPath);
}
