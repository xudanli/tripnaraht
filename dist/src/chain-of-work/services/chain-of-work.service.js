"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ChainOfWorkService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChainOfWorkService = void 0;
const common_1 = require("@nestjs/common");
const draft_generator_service_1 = require("../draft/draft-generator.service");
const draft_validator_service_1 = require("../draft/draft-validator.service");
const skill_mapping_service_1 = require("../mapping/skill/skill-mapping.service");
const sub_agent_mapping_service_1 = require("../mapping/sub-agent/sub-agent-mapping.service");
const execution_plan_generator_service_1 = require("../execution/execution-plan-generator.service");
const execution_integration_service_1 = require("../execution/execution-integration.service");
let ChainOfWorkService = ChainOfWorkService_1 = class ChainOfWorkService {
    constructor(draftGenerator, draftValidator, skillMapping, subAgentMapping, executionPlanGenerator, executionIntegration) {
        this.draftGenerator = draftGenerator;
        this.draftValidator = draftValidator;
        this.skillMapping = skillMapping;
        this.subAgentMapping = subAgentMapping;
        this.executionPlanGenerator = executionPlanGenerator;
        this.executionIntegration = executionIntegration;
        this.logger = new common_1.Logger(ChainOfWorkService_1.name);
    }
    async generateDraft(request, config) {
        this.logger.log(`[ChainOfWorkService] 开始生成步骤草案: request_id=${request.request_id}`);
        const startTime = Date.now();
        try {
            const draft = await this.draftGenerator.generateDraft(request, config);
            const validation = await this.draftValidator.validateDraft(draft);
            if (!validation.valid) {
                this.logger.warn(`[ChainOfWorkService] 步骤草案验证失败: ${validation.errors.length} 个错误`);
            }
            for (const step of draft.steps) {
                if (step.step_type === 'RESEARCH') {
                    const skillMappings = await this.skillMapping.mapStepToSkills(step, draft.orchestrator_state);
                    step.skills = skillMappings;
                }
            }
            for (const step of draft.steps) {
                if (['INTAKE', 'GATE_EVAL', 'PLAN_GEN', 'VERIFY', 'REPAIR', 'NARRATE'].includes(step.step_type)) {
                    const subAgentMapping = await this.subAgentMapping.mapStepToSubAgent(step, draft.orchestrator_state);
                    step.sub_agent = subAgentMapping.sub_agent;
                    step.guardian = subAgentMapping.guardian;
                }
            }
            const duration = Date.now() - startTime;
            this.logger.log(`[ChainOfWorkService] 步骤草案生成完成: duration=${duration}ms`);
            return draft;
        }
        catch (error) {
            this.logger.error(`[ChainOfWorkService] 步骤草案生成失败: ${(error === null || error === void 0 ? void 0 : error.message) || 'Unknown error'}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async validateDraft(draft) {
        return this.draftValidator.validateDraft(draft);
    }
    async generateExecutionPlan(draft) {
        return this.executionPlanGenerator.generatePlan(draft);
    }
    async executePlan(plan, request) {
        return this.executionIntegration.executePlan(plan, request);
    }
    async mapStepToSkills(step, context) {
        return this.skillMapping.mapStepToSkills(step, context);
    }
    async mapStepToSubAgent(step, context) {
        return this.subAgentMapping.mapStepToSubAgent(step, context);
    }
};
exports.ChainOfWorkService = ChainOfWorkService;
exports.ChainOfWorkService = ChainOfWorkService = ChainOfWorkService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [draft_generator_service_1.DraftGeneratorService,
        draft_validator_service_1.DraftValidatorService,
        skill_mapping_service_1.SkillMappingService,
        sub_agent_mapping_service_1.SubAgentMappingService,
        execution_plan_generator_service_1.ExecutionPlanGeneratorService,
        execution_integration_service_1.ExecutionIntegrationService])
], ChainOfWorkService);
//# sourceMappingURL=chain-of-work.service.js.map