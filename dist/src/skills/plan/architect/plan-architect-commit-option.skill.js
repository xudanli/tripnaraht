"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PlanArchitectCommitOptionSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanArchitectCommitOptionSkill = void 0;
const common_1 = require("@nestjs/common");
let PlanArchitectCommitOptionSkill = PlanArchitectCommitOptionSkill_1 = class PlanArchitectCommitOptionSkill {
    constructor() {
        this.logger = new common_1.Logger(PlanArchitectCommitOptionSkill_1.name);
        this.metadata = {
            name: 'plan.architect.commitOption',
            description: '用户选定方案后，写入 PlanState 并产生版本号',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        var _a;
        this.logger.debug(`执行 plan.architect.commitOption: optionId=${input.selectedOption.id}`);
        try {
            const plan_version = input.existingPlanState
                ? input.existingPlanState.plan_version + 1
                : 1;
            const plan_id = ((_a = input.existingPlanState) === null || _a === void 0 ? void 0 : _a.plan_id) || `plan_${Date.now()}`;
            const planState = {
                plan_id,
                plan_version,
                constraints: input.context.constraints || {},
                itinerary: this.convertSkeletonToItinerary(input.selectedOption, input.context),
                mobility: {
                    transferSegments: input.selectedOption.transferDays.map((td, idx) => ({
                        id: `transfer_${idx}`,
                        from: { city: td.from },
                        to: { city: td.to },
                        feasibility: 'needs_confirmation',
                        riskFlags: [],
                        availableModes: td.mode ? [{
                                mode: td.mode,
                                time: 0,
                                cost: 0,
                                reliability: 'medium',
                                effort: 'medium',
                            }] : undefined,
                    })),
                },
                budget: {},
                pace: {},
                gate: {
                    status: 'NEED_CONFIRM',
                    reasons: ['方案已选定，待进一步验证'],
                    missingEvidence: [],
                },
                evidence_refs: [],
                decision_log_refs: [],
                status: 'PROPOSED',
                metadata: {
                    selectedSkeleton: input.selectedOption.id,
                    selectedSkeletonName: input.selectedOption.name,
                },
            };
            const diff = this.computeDiff(input.existingPlanState, planState);
            const decision_log_ref = `decision_${Date.now()}`;
            return {
                planState,
                plan_version,
                diff,
                decision_log_ref,
            };
        }
        catch (error) {
            this.logger.error(`提交方案失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    convertSkeletonToItinerary(skeleton, context) {
        return {
            tripId: context.tripId || `trip_${Date.now()}`,
            days: context.days,
            segments: skeleton.dayThemes.map((theme, idx) => ({
                id: `segment_${idx}`,
                day: theme.day,
                theme: theme.theme,
                description: theme.description,
            })),
        };
    }
    computeDiff(oldState, newState) {
        var _a, _b, _c, _d;
        if (!oldState) {
            return { type: 'create', newState };
        }
        const diff = {
            type: 'update',
            changes: [],
        };
        if (oldState.status !== newState.status) {
            diff.changes.push({
                field: 'status',
                old: oldState.status,
                new: newState.status,
            });
        }
        if (((_a = oldState.metadata) === null || _a === void 0 ? void 0 : _a.selectedSkeleton) !== ((_b = newState.metadata) === null || _b === void 0 ? void 0 : _b.selectedSkeleton)) {
            diff.changes.push({
                field: 'selectedSkeleton',
                old: (_c = oldState.metadata) === null || _c === void 0 ? void 0 : _c.selectedSkeleton,
                new: (_d = newState.metadata) === null || _d === void 0 ? void 0 : _d.selectedSkeleton,
            });
        }
        return diff;
    }
};
exports.PlanArchitectCommitOptionSkill = PlanArchitectCommitOptionSkill;
exports.PlanArchitectCommitOptionSkill = PlanArchitectCommitOptionSkill = PlanArchitectCommitOptionSkill_1 = __decorate([
    (0, common_1.Injectable)()
], PlanArchitectCommitOptionSkill);
//# sourceMappingURL=plan-architect-commit-option.skill.js.map