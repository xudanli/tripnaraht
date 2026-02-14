"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ExecutionPlanGeneratorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionPlanGeneratorService = void 0;
const common_1 = require("@nestjs/common");
let ExecutionPlanGeneratorService = ExecutionPlanGeneratorService_1 = class ExecutionPlanGeneratorService {
    constructor() {
        this.logger = new common_1.Logger(ExecutionPlanGeneratorService_1.name);
    }
    async generatePlan(draft) {
        this.logger.log(`[ExecutionPlanGenerator] 开始生成执行计划: draft_id=${draft.draft_id}`);
        const steps = draft.steps.map(step => {
            var _a;
            return ({
                id: step.id,
                step_type: step.step_type,
                sub_agent: step.sub_agent,
                skills: ((_a = step.skills) === null || _a === void 0 ? void 0 : _a.map(s => s.skill_name)) || [],
                input_mapping: {},
                output_schema: {},
                dependencies: this.calculateDependencies(step, draft.steps),
                fallback_strategy: {
                    on_error: 'continue',
                    retry_count: 1,
                },
            });
        });
        const parallelGroups = this.identifyParallelGroups(steps);
        return {
            draft_id: draft.draft_id,
            workflow_id: draft.workflow_id,
            version: draft.version,
            steps,
            parallel_groups: parallelGroups,
        };
    }
    calculateDependencies(step, allSteps) {
        const stepOrder = {
            'INTAKE': 1,
            'RESEARCH': 2,
            'GATE_EVAL': 3,
            'PLAN_GEN': 4,
            'VERIFY': 5,
            'REPAIR': 6,
            'NARRATE': 7,
            'DONE': 8,
        };
        const currentOrder = stepOrder[step.step_type] || 99;
        const dependencies = [];
        for (const otherStep of allSteps) {
            const otherOrder = stepOrder[otherStep.step_type] || 99;
            if (otherOrder < currentOrder) {
                dependencies.push(otherStep.id);
            }
        }
        return dependencies;
    }
    identifyParallelGroups(steps) {
        const researchSteps = steps.filter(s => s.step_type === 'RESEARCH');
        if (researchSteps.length > 0) {
            return [researchSteps.map(s => s.id)];
        }
        return [];
    }
};
exports.ExecutionPlanGeneratorService = ExecutionPlanGeneratorService;
exports.ExecutionPlanGeneratorService = ExecutionPlanGeneratorService = ExecutionPlanGeneratorService_1 = __decorate([
    (0, common_1.Injectable)()
], ExecutionPlanGeneratorService);
//# sourceMappingURL=execution-plan-generator.service.js.map