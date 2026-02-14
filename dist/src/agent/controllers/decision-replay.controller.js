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
var DecisionReplayController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionReplayController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../../auth/guards/jwt-auth.guard");
const decision_replay_service_1 = require("../services/decision-replay.service");
let DecisionReplayController = DecisionReplayController_1 = class DecisionReplayController {
    constructor(replayService) {
        this.replayService = replayService;
        this.logger = new common_1.Logger(DecisionReplayController_1.name);
    }
    getTimeline(tripRunId) {
        const timeline = this.replayService.getTimeline(tripRunId);
        if (!timeline) {
            return { error: 'Timeline not found' };
        }
        return timeline;
    }
    getTimelineSummary(tripRunId) {
        const summary = this.replayService.buildTimelineSummary(tripRunId);
        if (!summary) {
            return { error: 'Timeline not found' };
        }
        return summary;
    }
    getSnapshot(tripRunId, snapshotId) {
        const snapshot = this.replayService.getSnapshot(tripRunId, snapshotId);
        if (!snapshot) {
            return { error: 'Snapshot not found' };
        }
        return snapshot;
    }
    getLatestSnapshot(tripRunId) {
        const snapshot = this.replayService.getLatestSnapshot(tripRunId);
        if (!snapshot) {
            return { error: 'No snapshots found' };
        }
        return snapshot;
    }
    replayToSnapshot(tripRunId, snapshotId) {
        const result = this.replayService.replayToSnapshot(tripRunId, snapshotId);
        if (!result) {
            return { error: 'Failed to replay - snapshot not found' };
        }
        this.logger.log(`[DecisionReplay] Replayed to snapshot ${snapshotId}`);
        return result;
    }
    getDiff(tripRunId, fromSnapshotId, toSnapshotId) {
        const diff = this.replayService.getDiffBetweenSnapshots(tripRunId, fromSnapshotId, toSnapshotId);
        if (!diff) {
            return { error: 'Failed to compute diff - snapshots not found' };
        }
        return diff;
    }
    simulateWhatIf(body) {
        this.logger.log(`[DecisionReplay] Simulating what-if from ${body.input.base_snapshot_id}`);
        return this.replayService.simulateWhatIf(body.input, body.decision_output);
    }
    generateCounterfactualQuestions(tripRunId, decisionOutput) {
        const questions = this.replayService.generateCounterfactualQuestions(decisionOutput);
        return { trip_run_id: tripRunId, questions };
    }
    getDecisionStyle(userId) {
        const style = this.replayService.getDecisionStyle(userId);
        if (!style) {
            return { error: 'No style data for user' };
        }
        return style;
    }
    inferPreferences(userId) {
        return this.replayService.inferPreferencesFromHistory(userId);
    }
    recordLearningSignal(userId, body) {
        this.replayService.recordLearningSignal(userId, body.signal_type, body.context);
        return { success: true, user_id: userId };
    }
    applyUserJudgment(tripRunId, body) {
        this.logger.log(`[DecisionReplay] Applying user judgment for ${tripRunId}: ${body.judgment_point_id} = ${body.selected_option}`);
        if (body.user_id) {
            this.replayService.recordLearningSignal(body.user_id, 'ACCEPT', `Judgment: ${body.judgment_point_id} = ${body.selected_option}`);
        }
        const latestSnapshot = this.replayService.getLatestSnapshot(tripRunId);
        if (!latestSnapshot) {
            return { error: 'No snapshot found for this trip run' };
        }
        return {
            success: true,
            trip_run_id: tripRunId,
            judgment_applied: {
                judgment_point_id: body.judgment_point_id,
                selected_option: body.selected_option,
            },
            current_snapshot_id: latestSnapshot.snapshot_id,
            message: 'User judgment recorded. Re-evaluation should be triggered by the orchestrator.',
            suggested_action: 'TRIGGER_REEVALUATION',
        };
    }
    getPendingJudgments(tripRunId) {
        const latestSnapshot = this.replayService.getLatestSnapshot(tripRunId);
        if (!latestSnapshot || !latestSnapshot.decision_output) {
            return { pending_judgments: [], message: 'No decision output found' };
        }
        const judgmentRequired = latestSnapshot.decision_output.user_judgment_required || [];
        return {
            trip_run_id: tripRunId,
            pending_judgments: judgmentRequired,
            total: judgmentRequired.length,
            snapshot_id: latestSnapshot.snapshot_id,
        };
    }
};
exports.DecisionReplayController = DecisionReplayController;
__decorate([
    (0, common_1.Get)('timeline/:tripRunId'),
    (0, swagger_1.ApiOperation)({ summary: '获取决策时间线', description: '获取指定行程的完整决策时间线' }),
    (0, swagger_1.ApiParam)({ name: 'tripRunId', description: '行程运行 ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '返回决策时间线' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '时间线不存在' }),
    __param(0, (0, common_1.Param)('tripRunId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], DecisionReplayController.prototype, "getTimeline", null);
__decorate([
    (0, common_1.Get)('timeline/:tripRunId/summary'),
    (0, swagger_1.ApiOperation)({ summary: '获取时间线摘要', description: '获取决策时间线的简化摘要' }),
    (0, swagger_1.ApiParam)({ name: 'tripRunId', description: '行程运行 ID' }),
    __param(0, (0, common_1.Param)('tripRunId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], DecisionReplayController.prototype, "getTimelineSummary", null);
__decorate([
    (0, common_1.Get)('snapshot/:tripRunId/:snapshotId'),
    (0, swagger_1.ApiOperation)({ summary: '获取决策快照', description: '获取指定的决策快照' }),
    (0, swagger_1.ApiParam)({ name: 'tripRunId', description: '行程运行 ID' }),
    (0, swagger_1.ApiParam)({ name: 'snapshotId', description: '快照 ID' }),
    __param(0, (0, common_1.Param)('tripRunId')),
    __param(1, (0, common_1.Param)('snapshotId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Object)
], DecisionReplayController.prototype, "getSnapshot", null);
__decorate([
    (0, common_1.Get)('snapshot/:tripRunId/latest'),
    (0, swagger_1.ApiOperation)({ summary: '获取最新快照', description: '获取最新的决策快照' }),
    (0, swagger_1.ApiParam)({ name: 'tripRunId', description: '行程运行 ID' }),
    __param(0, (0, common_1.Param)('tripRunId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], DecisionReplayController.prototype, "getLatestSnapshot", null);
__decorate([
    (0, common_1.Post)('replay/:tripRunId/:snapshotId'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '回放到指定快照', description: '将决策状态回放到指定的快照点' }),
    (0, swagger_1.ApiParam)({ name: 'tripRunId', description: '行程运行 ID' }),
    (0, swagger_1.ApiParam)({ name: 'snapshotId', description: '目标快照 ID' }),
    __param(0, (0, common_1.Param)('tripRunId')),
    __param(1, (0, common_1.Param)('snapshotId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], DecisionReplayController.prototype, "replayToSnapshot", null);
__decorate([
    (0, common_1.Get)('diff/:tripRunId'),
    (0, swagger_1.ApiOperation)({ summary: '获取快照差异', description: '比较两个快照之间的差异' }),
    (0, swagger_1.ApiParam)({ name: 'tripRunId', description: '行程运行 ID' }),
    (0, swagger_1.ApiQuery)({ name: 'from', description: '起始快照 ID' }),
    (0, swagger_1.ApiQuery)({ name: 'to', description: '目标快照 ID' }),
    __param(0, (0, common_1.Param)('tripRunId')),
    __param(1, (0, common_1.Query)('from')),
    __param(2, (0, common_1.Query)('to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], DecisionReplayController.prototype, "getDiff", null);
__decorate([
    (0, common_1.Post)('what-if'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '执行 What-If 模拟', description: '模拟不同选择或偏好的影响' }),
    (0, swagger_1.ApiBody)({
        description: 'What-If 模拟输入',
        schema: {
            type: 'object',
            properties: {
                input: {
                    type: 'object',
                    properties: {
                        base_snapshot_id: { type: 'string' },
                        changes: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    type: { type: 'string', enum: ['PREFERENCE_CHANGE', 'CONSTRAINT_CHANGE', 'OPTION_CHANGE', 'DATE_CHANGE'] },
                                    field: { type: 'string' },
                                    original_value: {},
                                    new_value: {},
                                },
                            },
                        },
                    },
                },
                decision_output: { type: 'object' },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], DecisionReplayController.prototype, "simulateWhatIf", null);
__decorate([
    (0, common_1.Post)('counterfactual/:tripRunId'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '生成反事实问题', description: '基于决策输出生成反事实问题' }),
    (0, swagger_1.ApiParam)({ name: 'tripRunId', description: '行程运行 ID' }),
    __param(0, (0, common_1.Param)('tripRunId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DecisionReplayController.prototype, "generateCounterfactualQuestions", null);
__decorate([
    (0, common_1.Get)('style/:userId'),
    (0, swagger_1.ApiOperation)({ summary: '获取用户决策风格', description: '获取用户的推断决策风格' }),
    (0, swagger_1.ApiParam)({ name: 'userId', description: '用户 ID' }),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], DecisionReplayController.prototype, "getDecisionStyle", null);
__decorate([
    (0, common_1.Get)('style/:userId/preferences'),
    (0, swagger_1.ApiOperation)({ summary: '推断用户偏好', description: '基于历史推断用户偏好' }),
    (0, swagger_1.ApiParam)({ name: 'userId', description: '用户 ID' }),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], DecisionReplayController.prototype, "inferPreferences", null);
__decorate([
    (0, common_1.Post)('style/:userId/signal'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '记录学习信号', description: '记录用户行为用于决策风格学习' }),
    (0, swagger_1.ApiParam)({ name: 'userId', description: '用户 ID' }),
    (0, swagger_1.ApiBody)({
        description: '学习信号',
        schema: {
            type: 'object',
            properties: {
                signal_type: { type: 'string', enum: ['ACCEPT', 'REJECT', 'MODIFY', 'QUESTION'] },
                context: { type: 'string' },
            },
        },
    }),
    __param(0, (0, common_1.Param)('userId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DecisionReplayController.prototype, "recordLearningSignal", null);
__decorate([
    (0, common_1.Post)('judgment/:tripRunId'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '提交用户判断', description: '用户提交对判断点的回答，触发重新评估' }),
    (0, swagger_1.ApiParam)({ name: 'tripRunId', description: '行程运行 ID' }),
    (0, swagger_1.ApiBody)({
        description: '用户判断',
        schema: {
            type: 'object',
            properties: {
                judgment_point_id: { type: 'string', description: '判断点 ID' },
                selected_option: { type: 'string', description: '用户选择的选项' },
                user_id: { type: 'string', description: '用户 ID' },
                context: { type: 'object', description: '附加上下文' },
            },
            required: ['judgment_point_id', 'selected_option'],
        },
    }),
    __param(0, (0, common_1.Param)('tripRunId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DecisionReplayController.prototype, "applyUserJudgment", null);
__decorate([
    (0, common_1.Get)('judgment/:tripRunId/pending'),
    (0, swagger_1.ApiOperation)({ summary: '获取待处理的判断点', description: '获取用户需要回答的判断点列表' }),
    (0, swagger_1.ApiParam)({ name: 'tripRunId', description: '行程运行 ID' }),
    __param(0, (0, common_1.Param)('tripRunId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], DecisionReplayController.prototype, "getPendingJudgments", null);
exports.DecisionReplayController = DecisionReplayController = DecisionReplayController_1 = __decorate([
    (0, swagger_1.ApiTags)('Decision Replay'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('v1/decision-replay'),
    __metadata("design:paramtypes", [decision_replay_service_1.DecisionReplayService])
], DecisionReplayController);
//# sourceMappingURL=decision-replay.controller.js.map