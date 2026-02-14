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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var DecisionDraftEditorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionDraftEditorService = void 0;
const common_1 = require("@nestjs/common");
const decision_draft_generator_service_1 = require("./decision-draft-generator.service");
const decision_debug_collector_service_1 = require("./decision-debug-collector.service");
const chain_of_work_service_1 = require("../../chain-of-work/services/chain-of-work.service");
const decision_draft_storage_service_1 = require("../storage/decision-draft-storage.service");
const decision_type_to_step_draft_mapper_1 = require("../mapping/decision-type-to-step-draft.mapper");
let DecisionDraftEditorService = DecisionDraftEditorService_1 = class DecisionDraftEditorService {
    constructor(decisionDraftGenerator, chainOfWorkService, storageService, decisionTypeMapper, debugCollector) {
        this.decisionDraftGenerator = decisionDraftGenerator;
        this.chainOfWorkService = chainOfWorkService;
        this.storageService = storageService;
        this.decisionTypeMapper = decisionTypeMapper;
        this.debugCollector = debugCollector;
        this.logger = new common_1.Logger(DecisionDraftEditorService_1.name);
    }
    async editDecisionStep(decisionDraft, operation) {
        this.logger.log(`[DecisionDraftEditor] 编辑决策步骤: decision_step_id=${operation.decision_step_id}, action=${operation.action}`);
        const decisionStep = decisionDraft.decision_steps.find((step) => step.id === operation.decision_step_id);
        if (!decisionStep) {
            throw new Error(`决策步骤不存在: ${operation.decision_step_id}`);
        }
        const updatedStep = this.applyEditOperation(decisionStep, operation);
        const updatedDraft = {
            ...decisionDraft,
            decision_steps: decisionDraft.decision_steps.map((step) => step.id === operation.decision_step_id ? updatedStep : step),
            metadata: {
                ...decisionDraft.metadata,
                updated_at: new Date().toISOString(),
            },
        };
        if (operation.action === 'modify' && operation.modifications) {
            const needsRegeneration = operation.modifications.outputs ||
                operation.modifications.evidence_weights;
            if (needsRegeneration) {
                this.logger.debug(`[DecisionDraftEditor] 检测到需要局部重算`);
            }
        }
        return updatedDraft;
    }
    async batchEditDecisionSteps(decisionDraft, operations) {
        this.logger.log(`[DecisionDraftEditor] 批量编辑决策步骤: count=${operations.length}`);
        let updatedDraft = decisionDraft;
        for (const operation of operations) {
            updatedDraft = await this.editDecisionStep(updatedDraft, operation);
        }
        return updatedDraft;
    }
    applyEditOperation(decisionStep, operation) {
        var _a, _b;
        const now = new Date().toISOString();
        switch (operation.action) {
            case 'approve':
                return {
                    ...decisionStep,
                    status: 'approved',
                    user_feedback: {
                        action: 'approve',
                        reasoning: operation.reasoning,
                        modified_at: now,
                    },
                    updated_at: now,
                };
            case 'reject':
                return {
                    ...decisionStep,
                    status: 'rejected',
                    user_feedback: {
                        action: 'reject',
                        reasoning: operation.reasoning,
                        modified_at: now,
                    },
                    updated_at: now,
                };
            case 'modify':
                const modifications = operation.modifications || {};
                return {
                    ...decisionStep,
                    status: 'modified',
                    title: (_a = modifications.title) !== null && _a !== void 0 ? _a : decisionStep.title,
                    description: (_b = modifications.description) !== null && _b !== void 0 ? _b : decisionStep.description,
                    outputs: modifications.outputs
                        ? modifications.outputs.map((output) => {
                            var _a;
                            return ({
                                name: output.name,
                                value: output.value,
                                confidence: (_a = output.confidence) !== null && _a !== void 0 ? _a : decisionStep.confidence,
                            });
                        })
                        : decisionStep.outputs,
                    evidence: modifications.evidence_weights
                        ? decisionStep.evidence.map((ev) => {
                            var _a;
                            return ({
                                ...ev,
                                confidence: (_a = modifications.evidence_weights[ev.evidence_id]) !== null && _a !== void 0 ? _a : ev.confidence,
                            });
                        })
                        : decisionStep.evidence,
                    user_feedback: {
                        action: 'modify',
                        reasoning: operation.reasoning,
                        modified_at: now,
                    },
                    updated_at: now,
                };
            default:
                throw new Error(`未知的编辑操作: ${operation.action}`);
        }
    }
    async partialRegenerate(decisionDraft, config = {}) {
        var _a;
        this.logger.log(`[DecisionDraftEditor] 开始局部重算`);
        const { regenerate_step_drafts = true, regenerate_decision_steps = false, preserve_approved_decisions = true, original_user_input, original_trip_plan_request, } = config;
        let userInput = original_user_input;
        let tripPlanRequest = original_trip_plan_request;
        if (!userInput || !tripPlanRequest) {
            if ((_a = decisionDraft.step_draft) === null || _a === void 0 ? void 0 : _a.trip_plan_request) {
                tripPlanRequest = decisionDraft.step_draft.trip_plan_request;
            }
            if (!userInput) {
                userInput = '重新生成决策步骤';
            }
        }
        const stepsToRegenerate = decisionDraft.decision_steps.filter((step) => {
            if (preserve_approved_decisions && step.status === 'approved') {
                return false;
            }
            return step.status === 'rejected' || step.status === 'modified';
        });
        this.logger.debug(`[DecisionDraftEditor] 需要重算的决策步骤数: ${stepsToRegenerate.length}`);
        let updatedDraft = { ...decisionDraft };
        if (regenerate_decision_steps && stepsToRegenerate.length > 0) {
            if (!userInput || !tripPlanRequest) {
                this.logger.warn(`[DecisionDraftEditor] 缺少原始输入，无法重新生成 Decision Steps`);
            }
            else {
                const regeneratedSteps = await this.regenerateDecisionSteps(stepsToRegenerate, userInput, tripPlanRequest);
                updatedDraft.decision_steps = decisionDraft.decision_steps.map((step) => {
                    const regenerated = regeneratedSteps.find((rs) => rs.id === step.id);
                    return regenerated || step;
                });
            }
        }
        if (regenerate_step_drafts && updatedDraft.step_draft) {
            const stepDraftIdsToRegenerate = new Set();
            stepsToRegenerate.forEach((step) => {
                step.step_draft_ids.forEach((id) => stepDraftIdsToRegenerate.add(id));
            });
            this.logger.debug(`[DecisionDraftEditor] 需要重算的 Step Draft IDs: ${Array.from(stepDraftIdsToRegenerate).join(', ')}`);
            if (stepDraftIdsToRegenerate.size > 0) {
                if (!tripPlanRequest) {
                    this.logger.warn(`[DecisionDraftEditor] 缺少原始 TripPlanRequest，无法重新生成 Step Drafts`);
                }
                else {
                    const regeneratedStepDraft = await this.chainOfWorkService.generateDraft(tripPlanRequest, {
                        model: 'claude-3-5-sonnet',
                        temperature: 0.7,
                    });
                    regeneratedStepDraft.draft_id = updatedDraft.step_draft.draft_id;
                    regeneratedStepDraft.workflow_id = updatedDraft.step_draft.workflow_id;
                    updatedDraft.step_draft = regeneratedStepDraft;
                    updatedDraft.step_draft_id = regeneratedStepDraft.draft_id;
                    updatedDraft.decision_steps = updatedDraft.decision_steps.map((step) => {
                        const stepTypes = this.getStepTypesForDecisionType(step.type);
                        const matchingStepIds = regeneratedStepDraft.steps
                            .filter((sd) => stepTypes.includes(sd.step_type))
                            .map((sd) => sd.id);
                        return {
                            ...step,
                            step_draft_ids: matchingStepIds.length > 0 ? matchingStepIds : step.step_draft_ids,
                        };
                    });
                }
            }
        }
        updatedDraft = {
            ...updatedDraft,
            metadata: {
                ...updatedDraft.metadata,
                updated_at: new Date().toISOString(),
            },
        };
        if (updatedDraft.user_mode === 'studio' && this.debugCollector) {
            updatedDraft.debug_info = await this.debugCollector.updateDebugInfo(updatedDraft.debug_info, undefined);
        }
        return updatedDraft;
    }
    async regenerateDecisionSteps(stepsToRegenerate, userInput, tripPlanRequest) {
        this.logger.debug(`[DecisionDraftEditor] 重新生成 ${stepsToRegenerate.length} 个决策步骤`);
        const regeneratedSteps = [];
        for (const step of stepsToRegenerate) {
            try {
                const targetedUserInput = this.buildTargetedUserInput(userInput, step.type);
                const fullDraft = await this.decisionDraftGenerator.generateDecisionDraft(targetedUserInput, tripPlanRequest, {
                    user_mode: 'expert',
                });
                const matchingStep = fullDraft.decision_steps.find((s) => s.type === step.type);
                if (matchingStep) {
                    const regeneratedStep = {
                        ...matchingStep,
                        id: step.id,
                        step_draft_ids: step.step_draft_ids,
                        status: 'modified',
                        user_feedback: step.user_feedback,
                        decision_log: [
                            ...(step.decision_log || []),
                            {
                                request_id: tripPlanRequest.request_id,
                                step: step.orchestration_step || 'PLAN_GEN',
                                actor: step.sub_agent || 'Planner',
                                inputs_summary: `重新生成决策步骤: ${step.type}`,
                                outputs_summary: `已重新生成，类型: ${matchingStep.type}`,
                                evidence_refs: matchingStep.evidence.map(ev => ev.evidence_id),
                                timestamp: new Date().toISOString(),
                                metadata: {
                                    regeneration_reason: 'user_modification',
                                    original_step_id: step.id,
                                },
                            },
                        ],
                        updated_at: new Date().toISOString(),
                    };
                    regeneratedSteps.push(regeneratedStep);
                }
                else {
                    this.logger.warn(`[DecisionDraftEditor] 无法找到匹配的决策步骤: decision_type=${step.type}`);
                    regeneratedSteps.push({
                        ...step,
                        status: 'modified',
                    });
                }
            }
            catch (error) {
                this.logger.error(`[DecisionDraftEditor] 重新生成决策步骤失败: step_id=${step.id}, error=${error.message}`);
                regeneratedSteps.push({
                    ...step,
                    status: 'modified',
                });
            }
        }
        return regeneratedSteps;
    }
    buildTargetedUserInput(originalInput, decisionType) {
        const typeContext = {
            'transport-decision': '关于交通方式的选择',
            'pace-decision': '关于行程节奏的安排',
            'poi-selection': '关于景点和POI的选择',
            'route-optimization': '关于路线优化的决策',
            'weather-strategy': '关于天气策略的制定',
            'budget-balance': '关于预算分配的平衡',
        };
        const context = typeContext[decisionType] || '相关决策';
        return `${originalInput}\n\n请特别关注：${context}。`;
    }
    getStepTypesForDecisionType(decisionType) {
        return this.decisionTypeMapper.getStepTypes(decisionType);
    }
    async reorderDecisionSteps(decisionDraft, newOrder) {
        this.logger.log(`[DecisionDraftEditor] 重新排序决策步骤`);
        const existingIds = decisionDraft.decision_steps.map((step) => step.id);
        const missingIds = existingIds.filter((id) => !newOrder.includes(id));
        const extraIds = newOrder.filter((id) => !existingIds.includes(id));
        if (missingIds.length > 0 || extraIds.length > 0) {
            throw new Error(`无效的排序: 缺失 ${missingIds.join(', ')}, 多余 ${extraIds.join(', ')}`);
        }
        const reorderedSteps = newOrder.map((id) => decisionDraft.decision_steps.find((step) => step.id === id));
        return {
            ...decisionDraft,
            decision_steps: reorderedSteps,
            metadata: {
                ...decisionDraft.metadata,
                updated_at: new Date().toISOString(),
            },
        };
    }
    async applyDecisionDraft(decisionDraft) {
        this.logger.log(`[DecisionDraftEditor] 应用决策草案: draft_id=${decisionDraft.draft_id}`);
        const approvedOrModifiedSteps = decisionDraft.decision_steps.filter((step) => step.status === 'approved' || step.status === 'modified');
        const pendingSteps = decisionDraft.decision_steps.filter((step) => step.status === 'pending');
        if (pendingSteps.length > 0) {
            this.logger.warn(`[DecisionDraftEditor] 存在未批准的决策步骤: ${pendingSteps.map((s) => s.id).join(', ')}`);
        }
        const now = new Date().toISOString();
        const appliedSteps = [];
        const skippedSteps = [];
        decisionDraft.decision_steps = decisionDraft.decision_steps.map((step) => {
            if (step.status === 'approved' || step.status === 'modified') {
                appliedSteps.push(step.id);
                return {
                    ...step,
                    status: 'applied',
                    updated_at: now,
                };
            }
            else {
                skippedSteps.push(step.id);
                return step;
            }
        });
        decisionDraft.metadata.updated_at = now;
        this.logger.log(`[DecisionDraftEditor] 应用完成: 已应用 ${appliedSteps.length} 个步骤，跳过 ${skippedSteps.length} 个步骤`);
        return {
            applied: appliedSteps.length > 0,
            applied_steps: appliedSteps,
            skipped_steps: skippedSteps,
            applied_at: now,
        };
    }
};
exports.DecisionDraftEditorService = DecisionDraftEditorService;
exports.DecisionDraftEditorService = DecisionDraftEditorService = DecisionDraftEditorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(4, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [decision_draft_generator_service_1.DecisionDraftGeneratorService,
        chain_of_work_service_1.ChainOfWorkService,
        decision_draft_storage_service_1.DecisionDraftStorageService,
        decision_type_to_step_draft_mapper_1.DecisionTypeToStepDraftMapper,
        decision_debug_collector_service_1.DecisionDebugCollectorService])
], DecisionDraftEditorService);
//# sourceMappingURL=decision-draft-editor.service.js.map