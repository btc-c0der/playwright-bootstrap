import { QAAgentOrchestrator } from "@qaf/orchestrator";
import { buildDefaultEngines } from "../config.js";
import { createRestApp } from "../rest/app.js";

const engines = buildDefaultEngines();
const orchestrator = new QAAgentOrchestrator(engines);
const app = createRestApp({ orchestrator, executionStore: engines.executionStore });

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: "0.0.0.0" }).catch((error: unknown) => {
  app.log.error(error);
  process.exit(1);
});
