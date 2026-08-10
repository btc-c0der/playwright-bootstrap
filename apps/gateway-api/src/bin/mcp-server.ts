import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { QAAgentOrchestrator } from "@qaf/orchestrator";
import { buildDefaultEngines } from "../config.js";
import { createMcpServer } from "../mcp/server.js";

async function main(): Promise<void> {
  const engines = buildDefaultEngines();
  const orchestrator = new QAAgentOrchestrator(engines);
  const server = createMcpServer({
    orchestrator,
    graphRag: engines.graphRag,
    executionStore: engines.executionStore,
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  process.stderr.write(`qaf-gateway-mcp failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
