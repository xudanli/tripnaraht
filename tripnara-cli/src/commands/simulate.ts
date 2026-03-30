import { Command } from "commander";
import { Simulator } from "../core/simulator";

export function registerSimulateCommand(program: Command): void {
  program
    .command("simulate")
    .description("Run policy simulation scenarios")
    .argument("<query>", "travel query")
    .option("--scenarios <n>", "scenario count", "3")
    .action((query: string, options: { scenarios: string }) => {
      const simulator = new Simulator();
      const result = simulator.run({
        query,
        scenarios: Number(options.scenarios),
      });
      console.log(JSON.stringify(result, null, 2));
    });
}
