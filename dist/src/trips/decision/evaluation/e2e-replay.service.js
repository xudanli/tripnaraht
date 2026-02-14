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
var E2EReplayService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.E2EReplayService = void 0;
const common_1 = require("@nestjs/common");
const trip_decision_engine_service_1 = require("../trip-decision-engine.service");
const decision_log_storage_service_1 = require("../services/decision-log-storage.service");
const e2e_case_storage_service_1 = require("./e2e-case-storage.service");
const e2e_assertions_1 = require("./e2e-assertions");
let E2EReplayService = E2EReplayService_1 = class E2EReplayService {
    constructor(decisionEngine, logStorage, caseStorage) {
        this.decisionEngine = decisionEngine;
        this.logStorage = logStorage;
        this.caseStorage = caseStorage;
        this.logger = new common_1.Logger(E2EReplayService_1.name);
    }
    async loadCase(caseId) {
        if (this.caseStorage) {
            return await this.caseStorage.loadCase(caseId);
        }
        this.logger.warn('E2ECaseStorageService 未注入，无法加载 E2E Case: ' + caseId);
        return null;
    }
    async replay(testCase) {
        var _a, _b, _c, _d;
        const startTime = Date.now();
        this.logger.debug('开始回放 E2E Case: ' + testCase.id + ' - ' + testCase.name);
        try {
            const worldState = this.buildWorldState(testCase);
            const requestId = 'e2e-' + testCase.id;
            const result = await this.decisionEngine.generatePlan(worldState, requestId);
            const tripId = ((_a = result.log.inputDigest) === null || _a === void 0 ? void 0 : _a.tripId) || requestId;
            const logs = await this.logStorage.queryLogs({
                tripId: tripId,
                limit: 1000,
            });
            const actual = {
                routeDirectionId: (_c = (_b = result.log.routeDirection) === null || _b === void 0 ? void 0 : _b.selected) === null || _c === void 0 ? void 0 : _c.uuid,
                logs: logs.map(log => ({
                    persona: log.persona,
                    action: log.action,
                    explanation: log.explanation,
                    reasonCodes: log.reasonCodes,
                    evidenceRefs: log.evidenceRefs,
                    timestamp: log.timestamp,
                    decisionSource: log.decisionSource,
                    decisionStage: log.decisionStage,
                })),
                finalPlan: {
                    days: ((_d = result.plan.days) === null || _d === void 0 ? void 0 : _d.length) || 0,
                    allowed: result.log.strategyLogs && result.log.strategyLogs.length > 0
                        ? result.log.strategyLogs[result.log.strategyLogs.length - 1].action !== 'REJECT'
                        : true,
                },
            };
            const diff = (0, e2e_assertions_1.analyzeDiff)(testCase.expected, actual);
            const passed = !diff.hasDiff;
            const executionTime = Date.now() - startTime;
            this.logger.debug('E2E Case 回放完成: ' + testCase.id + ', 通过=' + passed + ', 耗时=' + executionTime + 'ms');
            return {
                case: testCase,
                actual,
                diff,
                passed,
                executionTime,
            };
        }
        catch (error) {
            this.logger.error('E2E Case 回放失败: ' + testCase.id + ', 错误=' + error.message, error.stack);
            return {
                case: testCase,
                actual: {
                    logs: [],
                },
                diff: {
                    hasDiff: true,
                    finalStateDiff: '执行失败: ' + error.message,
                },
                passed: false,
                executionTime: Date.now() - startTime,
            };
        }
    }
    async replayAll(cases) {
        this.logger.debug('开始批量回放 ' + cases.length + ' 个 E2E Cases');
        const results = [];
        for (const testCase of cases) {
            const result = await this.replay(testCase);
            results.push(result);
        }
        const passedCount = results.filter(r => r.passed).length;
        const failedCount = results.length - passedCount;
        const totalCount = results.length;
        this.logger.log('批量回放完成: 总计=' + totalCount + ', 通过=' + passedCount + ', 失败=' + failedCount);
        return results;
    }
    buildWorldState(testCase) {
        const userProfile = testCase.input.userProfile;
        const context = {
            destination: testCase.input.countryCode,
            startDate: this.getStartDateForSeason(testCase.input.season),
            durationDays: 7,
            preferences: {
                pace: userProfile.pacePreference || 'MEDIUM',
                riskTolerance: userProfile.riskTolerance || 'MEDIUM',
                tags: userProfile.preferredRouteTypes || [],
            },
        };
        return {
            context,
            candidatesByDate: {},
            signals: {
                lastUpdatedAt: new Date().toISOString(),
            },
        };
    }
    getStartDateForSeason(month) {
        const currentYear = new Date().getFullYear();
        const date = new Date(currentYear, month - 1, 1);
        return date.toISOString().split('T')[0];
    }
};
exports.E2EReplayService = E2EReplayService;
exports.E2EReplayService = E2EReplayService = E2EReplayService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [trip_decision_engine_service_1.TripDecisionEngineService,
        decision_log_storage_service_1.DecisionLogStorageService,
        e2e_case_storage_service_1.E2ECaseStorageService])
], E2EReplayService);
//# sourceMappingURL=e2e-replay.service.js.map