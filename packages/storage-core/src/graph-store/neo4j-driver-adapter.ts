import type { CypherDriver } from "@qaf/graph-rag";

/** The minimal shape of a real `neo4j-driver` `Session` this adapter needs — matches its actual API without this package depending on it. */
export interface Neo4jSessionLike {
  run(cypher: string, params?: Record<string, unknown>): Promise<{ records: Array<{ toObject(): Record<string, unknown> }> }>;
}

/**
 * Wraps a real `neo4j-driver` `Session` (`neo4j.driver(uri, auth).session()`)
 * — or a Memgraph session, since both speak this same driver API — into
 * `@qaf/graph-rag`'s `CypherDriver`, the one-line adapter
 * `Neo4jCompatibleGraphStore`'s own docs point at. No `neo4j-driver`
 * dependency added here; construct the driver/session yourself and pass it
 * in — same "inject your own driver" posture as this package's `SqlExecutor`.
 */
export function createNeo4jCypherDriver(session: Neo4jSessionLike): CypherDriver {
  return {
    async run(cypher, params) {
      const result = await session.run(cypher, params);
      return result.records.map((record) => record.toObject());
    },
  };
}
