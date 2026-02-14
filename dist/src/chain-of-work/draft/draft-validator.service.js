"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DraftValidatorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DraftValidatorService = void 0;
const common_1 = require("@nestjs/common");
let DraftValidatorService = DraftValidatorService_1 = class DraftValidatorService {
    constructor() {
        this.logger = new common_1.Logger(DraftValidatorService_1.name);
    }
    async validateDraft(draft) {
        this.logger.debug(`[DraftValidator] 开始验证步骤草案: draft_id=${draft.draft_id}`);
        const errors = [];
        const warnings = [];
        const requiredSteps = ['INTAKE', 'RESEARCH', 'GATE_EVAL', 'PLAN_GEN', 'VERIFY', 'COMPLIANCE', 'REPAIR', 'NARRATE', 'FEEDBACK', 'DONE'];
        const stepTypes = draft.steps.map(s => s.step_type);
        for (const requiredStep of requiredSteps) {
            if (!stepTypes.includes(requiredStep)) {
                errors.push({
                    step_id: 'draft',
                    error_type: 'MISSING_SKILL',
                    message: `缺少必需的步骤: ${requiredStep}`,
                });
            }
        }
        const gateEvalIndex = stepTypes.indexOf('GATE_EVAL');
        const planGenIndex = stepTypes.indexOf('PLAN_GEN');
        if (gateEvalIndex !== -1 && planGenIndex !== -1 && gateEvalIndex >= planGenIndex) {
            errors.push({
                step_id: 'draft',
                error_type: 'ORDER_VIOLATION',
                message: 'GATE_EVAL 步骤必须在 PLAN_GEN 步骤之前',
                suggestion: '请调整步骤顺序',
            });
        }
        const researchStep = draft.steps.find(s => s.step_type === 'RESEARCH');
        if (researchStep && (!researchStep.skills || researchStep.skills.length === 0)) {
            warnings.push({
                step_id: researchStep.id,
                warning_type: 'MISSING_FALLBACK',
                message: 'RESEARCH 步骤没有映射到任何 Skills',
            });
        }
        for (const step of draft.steps) {
            if (step.skills) {
                for (const skillMapping of step.skills) {
                    if (typeof skillMapping === 'object' && 'confidence' in skillMapping) {
                        if (skillMapping.confidence < 0.7) {
                            warnings.push({
                                step_id: step.id,
                                warning_type: 'LOW_CONFIDENCE',
                                message: `Skills 映射置信度较低: ${skillMapping.skill_name} (${skillMapping.confidence})`,
                            });
                        }
                    }
                }
            }
        }
        const valid = errors.length === 0;
        this.logger.debug(`[DraftValidator] 验证完成: valid=${valid}, errors=${errors.length}, warnings=${warnings.length}`);
        return {
            valid,
            errors,
            warnings,
        };
    }
};
exports.DraftValidatorService = DraftValidatorService;
exports.DraftValidatorService = DraftValidatorService = DraftValidatorService_1 = __decorate([
    (0, common_1.Injectable)()
], DraftValidatorService);
//# sourceMappingURL=draft-validator.service.js.map