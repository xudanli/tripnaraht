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
var DecisionReplaySkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionReplaySkill = void 0;
const common_1 = require("@nestjs/common");
const e2e_replay_service_1 = require("../../trips/decision/evaluation/e2e-replay.service");
let DecisionReplaySkill = DecisionReplaySkill_1 = class DecisionReplaySkill {
    constructor(e2eReplayService) {
        this.e2eReplayService = e2eReplayService;
        this.logger = new common_1.Logger(DecisionReplaySkill_1.name);
        this.metadata = {
            name: 'decision.replay',
            description: 'E2E 回放：给定 logs + inputs，回放并 diff，这是 E2E 与评测的生命线',
            version: '1.0.0',
            category: 'decision',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 decision.replay: caseId=${input.caseId || 'none'}, hasTestCase=${!!input.testCase}`);
        try {
            if (!this.e2eReplayService) {
                throw new Error('E2EReplayService 未注入');
            }
            let testCase = null;
            if (input.caseId) {
                testCase = await this.e2eReplayService.loadCase(input.caseId);
                if (!testCase) {
                    throw new Error(`E2E Case 未找到: ${input.caseId}`);
                }
            }
            else if (input.testCase) {
                testCase = {
                    id: input.testCase.id,
                    name: input.testCase.name,
                    description: input.testCase.description,
                    input: input.testCase.input,
                    expected: input.testCase.expected
                        ? {
                            routeDirectionId: input.testCase.expected.routeDirectionId,
                            routeDirectionTags: input.testCase.expected.routeDirectionTags,
                            abuExpected: input.testCase.expected.abuExpected
                                ? {
                                    action: input.testCase.expected.abuExpected.action,
                                    reasonCodes: input.testCase.expected.abuExpected.reasonCodes,
                                    violations: input.testCase.expected.abuExpected.violations,
                                }
                                : undefined,
                            drdreExpected: input.testCase.expected.drdreExpected
                                ? {
                                    mustAdjust: input.testCase.expected.drdreExpected.mustAdjust,
                                    adjustmentTypes: input.testCase.expected.drdreExpected.adjustmentTypes,
                                }
                                : undefined,
                            neptuneExpected: input.testCase.expected.neptuneExpected
                                ? {
                                    mustRepair: input.testCase.expected.neptuneExpected.mustRepair,
                                    replacementTypes: input.testCase.expected.neptuneExpected.replacementTypes,
                                }
                                : undefined,
                            finalState: {
                                allowed: input.testCase.expected.finalState.allowed,
                                planDays: input.testCase.expected.finalState.planDays,
                            },
                        }
                        : undefined,
                };
            }
            else if (input.inputs) {
                testCase = {
                    id: `replay-${Date.now()}`,
                    name: 'Direct Replay',
                    description: '直接回放（无期望值）',
                    input: {
                        userProfile: input.inputs.userProfile,
                        season: input.inputs.season || 7,
                        countryCode: input.inputs.countryCode,
                        userQuery: input.inputs.userQuery || `回放 ${input.inputs.countryCode}`,
                    },
                    expected: undefined,
                };
            }
            else {
                throw new Error('必须提供 caseId、testCase 或 inputs 之一');
            }
            const replayResult = await this.e2eReplayService.replay(testCase);
            return {
                actual: {
                    logs: replayResult.actual.logs,
                    finalPlan: replayResult.actual.finalPlan,
                    routeDirectionId: replayResult.actual.routeDirectionId,
                },
                diff: replayResult.diff
                    ? {
                        hasDiff: replayResult.diff.hasDiff,
                        logDiffs: undefined,
                        finalStateDiff: replayResult.diff.finalStateDiff,
                        abuDiff: replayResult.diff.abuDiff,
                        drdreDiff: replayResult.diff.drdreDiff,
                        neptuneDiff: replayResult.diff.neptuneDiff,
                        routeDirectionDiff: replayResult.diff.routeDirectionDiff,
                    }
                    : undefined,
                passed: replayResult.passed,
                executionTime: replayResult.executionTime || 0,
                case: {
                    id: replayResult.case.id,
                    name: replayResult.case.name,
                    description: replayResult.case.description,
                },
            };
        }
        catch (error) {
            this.logger.error(`E2E 回放失败: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.DecisionReplaySkill = DecisionReplaySkill;
exports.DecisionReplaySkill = DecisionReplaySkill = DecisionReplaySkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [e2e_replay_service_1.E2EReplayService])
], DecisionReplaySkill);
//# sourceMappingURL=decision-replay.skill.js.map