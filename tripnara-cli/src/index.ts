#!/usr/bin/env node

import { Command } from "commander";
import { registerPlanCommand } from "./commands/plan";
import { registerPolicyCommand } from "./commands/policy";
import { registerRunAgentCommand } from "./commands/run-agent";
import { registerSimulateCommand } from "./commands/simulate";
import { registerExplainCommand } from "./commands/explain";
import { registerRunRouteAndRunCommand } from "./commands/run-route-and-run";
import { registerRouteAndRunC1Command } from "./commands/route-and-run-c1";
import { registerHarnessCommand } from "./commands/harness";

const program = new Command();

program
  .name("tripnara")
  .description("TripNARA Decision Intelligence CLI")
  .version("1.0.0");

registerPlanCommand(program);
registerPolicyCommand(program);
registerSimulateCommand(program);
registerExplainCommand(program);
registerRunAgentCommand(program);
registerRunRouteAndRunCommand(program);
registerRouteAndRunC1Command(program);
registerHarnessCommand(program);

program.parse();
