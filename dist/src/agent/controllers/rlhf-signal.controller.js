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
var RLHFSignalController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RLHFSignalController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../../auth/guards/jwt-auth.guard");
const rlhf_signal_collector_service_1 = require("../services/rlhf-signal-collector.service");
let RLHFSignalController = RLHFSignalController_1 = class RLHFSignalController {
    constructor(rlhfService) {
        this.rlhfService = rlhfService;
        this.logger = new common_1.Logger(RLHFSignalController_1.name);
    }
    recordBehaviorSignal(signal) {
        this.logger.debug(`[RLHF] Recording behavior: ${signal.signal_type}`);
        return this.rlhfService.recordBehaviorSignal(signal);
    }
    recordPlanViewTime(body) {
        this.rlhfService.recordPlanViewTime(body.trip_run_id, body.plan_id, body.duration_ms);
        return { success: true, recorded: 'plan_view_time' };
    }
    recordDetailInteraction(body) {
        this.rlhfService.recordDetailInteraction(body.trip_run_id, body.element_type, body.element_id, body.action);
        return { success: true, recorded: 'detail_interaction' };
    }
    recordExecutionSignal(signal) {
        this.logger.debug(`[RLHF] Recording execution: ${signal.signal_type}`);
        return this.rlhfService.recordExecutionSignal(signal);
    }
    recordDeviation(body) {
        this.rlhfService.recordDeviation(body.trip_run_id, body.planned_item_id, body.planned_time, body.actual_time, body.reason);
        return { success: true, recorded: 'deviation' };
    }
    recordSkippedActivity(body) {
        this.rlhfService.recordSkippedActivity(body.trip_run_id, body.planned_item_id, body.reason);
        return { success: true, recorded: 'skipped_activity' };
    }
    recordFeedbackSignal(signal) {
        this.logger.debug(`[RLHF] Recording feedback: ${signal.feedback_type}`);
        return this.rlhfService.recordFeedbackSignal(signal);
    }
    recordAcceptance(body) {
        this.rlhfService.recordAcceptance(body.trip_run_id, body.decision_point_id, body.chosen_option_id);
        return { success: true, recorded: 'acceptance' };
    }
    recordRejection(body) {
        this.rlhfService.recordRejection(body.trip_run_id, body.decision_point_id, body.reason);
        return { success: true, recorded: 'rejection' };
    }
    recordRating(body) {
        this.rlhfService.recordRating(body.trip_run_id, body.decision_point_id, body.rating, body.comment);
        return { success: true, recorded: 'rating' };
    }
    assessDecisionQuality(tripRunId, decisionPointId, decisionOutput) {
        this.logger.log(`[RLHF] Assessing quality for ${tripRunId}/${decisionPointId}`);
        return this.rlhfService.assessDecisionQuality(tripRunId, decisionPointId, decisionOutput);
    }
    generateLearningSignals(tripRunId) {
        this.logger.log(`[RLHF] Generating learning signals for ${tripRunId}`);
        return this.rlhfService.generateLearningSignals(tripRunId);
    }
    getSignalSummary(tripRunId) {
        return this.rlhfService.getSignalSummary(tripRunId);
    }
};
exports.RLHFSignalController = RLHFSignalController;
__decorate([
    (0, common_1.Post)('behavior'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: '记录行为信号', description: '记录用户交互行为信号' }),
    (0, swagger_1.ApiBody)({
        description: '行为信号',
        schema: {
            type: 'object',
            properties: {
                trip_run_id: { type: 'string' },
                user_id: { type: 'string' },
                signal_type: { type: 'string', enum: ['VIEW', 'CLICK', 'HOVER', 'SCROLL', 'TIME_SPENT', 'EXPAND', 'COLLAPSE'] },
                target: {
                    type: 'object',
                    properties: {
                        element_type: { type: 'string', enum: ['PLAN', 'OPTION', 'COMPARISON', 'RISK', 'TRADEOFF', 'DETAIL'] },
                        element_id: { type: 'string' },
                        element_context: { type: 'string' },
                    },
                },
                metadata: {
                    type: 'object',
                    properties: {
                        duration_ms: { type: 'number' },
                        scroll_depth: { type: 'number' },
                        viewport_visible: { type: 'boolean' },
                    },
                },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], RLHFSignalController.prototype, "recordBehaviorSignal", null);
__decorate([
    (0, common_1.Post)('behavior/plan-view'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: '记录方案查看时间', description: '记录用户查看方案的时长' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                trip_run_id: { type: 'string' },
                plan_id: { type: 'string' },
                duration_ms: { type: 'number' },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RLHFSignalController.prototype, "recordPlanViewTime", null);
__decorate([
    (0, common_1.Post)('behavior/detail'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: '记录详情交互', description: '记录用户展开/收起详情的行为' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                trip_run_id: { type: 'string' },
                element_type: { type: 'string', enum: ['PLAN', 'OPTION', 'COMPARISON', 'RISK', 'TRADEOFF', 'DETAIL'] },
                element_id: { type: 'string' },
                action: { type: 'string', enum: ['EXPAND', 'COLLAPSE'] },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RLHFSignalController.prototype, "recordDetailInteraction", null);
__decorate([
    (0, common_1.Post)('execution'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: '记录执行信号', description: '记录行程执行信号' }),
    (0, swagger_1.ApiBody)({
        description: '执行信号',
        schema: {
            type: 'object',
            properties: {
                trip_run_id: { type: 'string' },
                signal_type: { type: 'string', enum: ['START', 'DEVIATION', 'SKIP', 'DELAY', 'EARLY', 'COMPLETE', 'ABORT'] },
                context: {
                    type: 'object',
                    properties: {
                        planned_item_id: { type: 'string' },
                        planned_time: { type: 'string' },
                        actual_time: { type: 'string' },
                        deviation_minutes: { type: 'number' },
                        reason: { type: 'string' },
                    },
                },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], RLHFSignalController.prototype, "recordExecutionSignal", null);
__decorate([
    (0, common_1.Post)('execution/deviation'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: '记录行程偏差', description: '记录计划与实际执行的偏差' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                trip_run_id: { type: 'string' },
                planned_item_id: { type: 'string' },
                planned_time: { type: 'string', format: 'date-time' },
                actual_time: { type: 'string', format: 'date-time' },
                reason: { type: 'string' },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RLHFSignalController.prototype, "recordDeviation", null);
__decorate([
    (0, common_1.Post)('execution/skip'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: '记录跳过的活动', description: '记录用户跳过的计划活动' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                trip_run_id: { type: 'string' },
                planned_item_id: { type: 'string' },
                reason: { type: 'string' },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RLHFSignalController.prototype, "recordSkippedActivity", null);
__decorate([
    (0, common_1.Post)('feedback'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: '记录反馈信号', description: '记录用户显式反馈' }),
    (0, swagger_1.ApiBody)({
        description: '反馈信号',
        schema: {
            type: 'object',
            properties: {
                trip_run_id: { type: 'string' },
                user_id: { type: 'string' },
                decision_point_id: { type: 'string' },
                feedback_type: { type: 'string', enum: ['ACCEPT', 'REJECT', 'MODIFY', 'QUESTION', 'RATING', 'COMMENT'] },
                value: {
                    type: 'object',
                    properties: {
                        rating: { type: 'number' },
                        choice: { type: 'string' },
                        modification: { type: 'object' },
                        comment: { type: 'string' },
                    },
                },
                context: { type: 'object' },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], RLHFSignalController.prototype, "recordFeedbackSignal", null);
__decorate([
    (0, common_1.Post)('feedback/accept'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: '记录接受推荐', description: '记录用户接受推荐方案' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                trip_run_id: { type: 'string' },
                decision_point_id: { type: 'string' },
                chosen_option_id: { type: 'string' },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RLHFSignalController.prototype, "recordAcceptance", null);
__decorate([
    (0, common_1.Post)('feedback/reject'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: '记录拒绝推荐', description: '记录用户拒绝推荐方案' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                trip_run_id: { type: 'string' },
                decision_point_id: { type: 'string' },
                reason: { type: 'string' },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RLHFSignalController.prototype, "recordRejection", null);
__decorate([
    (0, common_1.Post)('feedback/rating'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: '记录用户评分', description: '记录用户对决策的评分' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                trip_run_id: { type: 'string' },
                decision_point_id: { type: 'string' },
                rating: { type: 'number', minimum: 1, maximum: 5 },
                comment: { type: 'string' },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RLHFSignalController.prototype, "recordRating", null);
__decorate([
    (0, common_1.Post)('quality/:tripRunId/:decisionPointId'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '评估决策质量', description: '评估指定决策点的质量' }),
    (0, swagger_1.ApiParam)({ name: 'tripRunId', description: '行程运行 ID' }),
    (0, swagger_1.ApiParam)({ name: 'decisionPointId', description: '决策点 ID' }),
    __param(0, (0, common_1.Param)('tripRunId')),
    __param(1, (0, common_1.Param)('decisionPointId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Object)
], RLHFSignalController.prototype, "assessDecisionQuality", null);
__decorate([
    (0, common_1.Get)('learning/:tripRunId'),
    (0, swagger_1.ApiOperation)({ summary: '生成学习信号', description: '基于收集的信号生成学习信号' }),
    (0, swagger_1.ApiParam)({ name: 'tripRunId', description: '行程运行 ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '返回学习信号列表' }),
    __param(0, (0, common_1.Param)('tripRunId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Array)
], RLHFSignalController.prototype, "generateLearningSignals", null);
__decorate([
    (0, common_1.Get)('summary/:tripRunId'),
    (0, swagger_1.ApiOperation)({ summary: '获取信号摘要', description: '获取行程的信号收集摘要' }),
    (0, swagger_1.ApiParam)({ name: 'tripRunId', description: '行程运行 ID' }),
    __param(0, (0, common_1.Param)('tripRunId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RLHFSignalController.prototype, "getSignalSummary", null);
exports.RLHFSignalController = RLHFSignalController = RLHFSignalController_1 = __decorate([
    (0, swagger_1.ApiTags)('RLHF Signals'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('v1/rlhf'),
    __metadata("design:paramtypes", [rlhf_signal_collector_service_1.RLHFSignalCollectorService])
], RLHFSignalController);
//# sourceMappingURL=rlhf-signal.controller.js.map