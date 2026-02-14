"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanExecuteModule = void 0;
const common_1 = require("@nestjs/common");
const orchestrator_service_1 = require("./orchestrator.service");
const planner_service_1 = require("./planner.service");
const replanner_service_1 = require("./replanner.service");
const executor_service_1 = require("./executor.service");
const context_assembler_service_1 = require("./context-assembler.service");
const llm_module_1 = require("../../llm/llm.module");
const training_module_1 = require("../training/training.module");
const isMcpMode = process.argv.some(arg => arg.includes('mcp-skills-server')) ||
    process.env.MCP_MODE === 'true';
let AgentModuleRef = null;
if (!isMcpMode) {
    try {
        const agentModule = require('../agent.module');
        AgentModuleRef = (0, common_1.forwardRef)(() => agentModule.AgentModule);
    }
    catch (e) {
        AgentModuleRef = null;
    }
}
let PlanExecuteModule = class PlanExecuteModule {
};
exports.PlanExecuteModule = PlanExecuteModule;
exports.PlanExecuteModule = PlanExecuteModule = __decorate([
    (0, common_1.Module)({
        imports: [
            llm_module_1.LlmModule,
            training_module_1.TrainingModule,
            ...(AgentModuleRef ? [AgentModuleRef] : []),
        ],
        providers: [
            orchestrator_service_1.DAGOrchestratorService,
            planner_service_1.PlannerService,
            replanner_service_1.ReplannerService,
            executor_service_1.ExecutorService,
            context_assembler_service_1.ContextAssemblerService,
        ],
        exports: [
            orchestrator_service_1.DAGOrchestratorService,
            planner_service_1.PlannerService,
            replanner_service_1.ReplannerService,
            executor_service_1.ExecutorService,
            context_assembler_service_1.ContextAssemblerService,
        ],
    })
], PlanExecuteModule);
//# sourceMappingURL=plan-execute.module.js.map