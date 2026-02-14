"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var SubAgentMappingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubAgentMappingService = void 0;
const common_1 = require("@nestjs/common");
let SubAgentMappingService = SubAgentMappingService_1 = class SubAgentMappingService {
    constructor() {
        this.logger = new common_1.Logger(SubAgentMappingService_1.name);
        this.stepToSubAgentMap = {
            'INTAKE': 'Planner',
            'RESEARCH': 'Planner',
            'GATE_EVAL': 'Gatekeeper',
            'PLAN_GEN': 'Planner',
            'VERIFY': 'CoreDecision',
            'COMPLIANCE': 'Compliance',
            'REPAIR': 'LocalInsight',
            'NARRATE': 'Narrator',
            'FEEDBACK': 'CoreDecision',
            'DONE': 'Orchestrator',
            'FAILED': 'Orchestrator',
            'TIMEOUT': 'Orchestrator',
            'HALLUCINATION_DETECTION': 'HallucinationDetection',
        };
        this.subAgentToGuardianMap = {
            'Planner': null,
            'Gatekeeper': 'ABU',
            'CoreDecision': 'DR_DRE',
            'LocalInsight': 'NEPTUNE',
            'Narrator': null,
            'Compliance': 'ABU',
            'Orchestrator': null,
            'HallucinationDetection': null,
        };
    }
    async mapStepToSubAgent(step, context) {
        this.logger.debug(`[SubAgentMapping] 开始映射步骤到 Sub-Agent: step_id=${step.id}, step_type=${step.step_type}`);
        const subAgent = this.stepToSubAgentMap[step.step_type] || 'Planner';
        const guardian = this.subAgentToGuardianMap[subAgent] || undefined;
        return {
            step_id: step.id,
            sub_agent: subAgent,
            guardian,
            prompt_template: this.getPromptTemplate(step, subAgent),
            output_schema: this.getOutputSchema(step, subAgent),
        };
    }
    getPromptTemplate(step, subAgent) {
        return `执行步骤: ${step.title}\n描述: ${step.description}`;
    }
    getOutputSchema(step, subAgent) {
        return {};
    }
    mapToGuardian(subAgent, step) {
        return this.subAgentToGuardianMap[subAgent] || null;
    }
};
exports.SubAgentMappingService = SubAgentMappingService;
exports.SubAgentMappingService = SubAgentMappingService = SubAgentMappingService_1 = __decorate([
    (0, common_1.Injectable)()
], SubAgentMappingService);
//# sourceMappingURL=sub-agent-mapping.service.js.map