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
var ContextAssemblerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextAssemblerService = void 0;
const common_1 = require("@nestjs/common");
const agent_state_service_1 = require("../services/agent-state.service");
let ContextAssemblerService = ContextAssemblerService_1 = class ContextAssemblerService {
    constructor(agentStateService) {
        this.agentStateService = agentStateService;
        this.logger = new common_1.Logger(ContextAssemblerService_1.name);
    }
    async getSummary(threadId, userGoal) {
        this.logger.debug(`组装上下文摘要: threadId=${threadId}`);
        if (this.agentStateService) {
            const state = this.agentStateService.get(threadId);
            if (state) {
                return {
                    threadId,
                    userGoal: userGoal || state.user_input,
                    currentState: this.summarizeState(state),
                    completedSteps: this.extractCompletedSteps(state),
                    constraints: this.extractConstraints(state),
                    budget: this.extractBudget(state),
                };
            }
        }
        return {
            threadId,
            userGoal: userGoal || '未指定目标',
            currentState: '初始状态',
            completedSteps: [],
            constraints: {},
        };
    }
    summarizeState(state) {
        var _a, _b, _c, _d, _e;
        const parts = [];
        if ((_a = state.trip) === null || _a === void 0 ? void 0 : _a.trip_id) {
            parts.push(`行程 ID: ${state.trip.trip_id}`);
        }
        if ((_c = (_b = state.result) === null || _b === void 0 ? void 0 : _b.timeline) === null || _c === void 0 ? void 0 : _c.length) {
            parts.push(`已规划 ${state.result.timeline.length} 个节点`);
        }
        if ((_d = state.memory) === null || _d === void 0 ? void 0 : _d.readiness) {
            const readiness = state.memory.readiness;
            parts.push(`准备度: ${((_e = readiness.summary) === null || _e === void 0 ? void 0 : _e.total_blockers) || 0} 个阻塞项`);
        }
        return parts.length > 0 ? parts.join('; ') : '无特殊状态';
    }
    extractCompletedSteps(state) {
        var _a;
        const steps = [];
        if ((_a = state.react) === null || _a === void 0 ? void 0 : _a.decision_log) {
            state.react.decision_log.forEach((log) => {
                if (log.chosen_action) {
                    steps.push(log.chosen_action);
                }
            });
        }
        return steps;
    }
    extractConstraints(state) {
        var _a, _b;
        const constraints = {};
        if (state.trip) {
            constraints.days = state.trip.days;
            constraints.pacing = state.trip.pacing;
            constraints.lunchBreak = state.trip.lunch_break;
        }
        if ((_b = (_a = state.memory) === null || _a === void 0 ? void 0 : _a.readiness) === null || _b === void 0 ? void 0 : _b.constraints) {
            constraints.readiness = state.memory.readiness.constraints;
        }
        return constraints;
    }
    extractBudget(state) {
        return undefined;
    }
    async updateSummary(summary, stepId, result) {
        return {
            ...summary,
            completedSteps: [...summary.completedSteps, stepId],
            currentState: this.mergeStateUpdate(summary.currentState, result),
        };
    }
    mergeStateUpdate(currentState, result) {
        if (result === null || result === void 0 ? void 0 : result.summary) {
            return `${currentState}; ${result.summary}`;
        }
        return currentState;
    }
};
exports.ContextAssemblerService = ContextAssemblerService;
exports.ContextAssemblerService = ContextAssemblerService = ContextAssemblerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [agent_state_service_1.AgentStateService])
], ContextAssemblerService);
//# sourceMappingURL=context-assembler.service.js.map