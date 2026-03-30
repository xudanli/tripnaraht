import { Command } from "commander";
import fs from "node:fs";
import { runDSL } from "../dsl/runner";
import { parseDSL } from "../dsl/parser";

export function registerRunAgentCommand(program: Command): void {
  program
    .command("run-agent")
    .description("Run a DSL file")
    .argument("<file>", "dsl file")
    .action(async (file: string) => {
      const content = fs.readFileSync(file, "utf-8");
      const dsl = parseDSL(JSON.parse(content));
      await runDSL(dsl);
    });
}
