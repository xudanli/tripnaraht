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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitoringMetricsResponseDto = exports.CheckAdvancedConstraintsRequestDto = exports.EvaluatePlanResponseDto = exports.EvaluatePlanRequestDto = exports.LearnFromLogsResponseDto = exports.LearnFromLogsRequestDto = exports.ExplainPlanResponseDto = exports.ExplainPlanRequestDto = exports.RepairPlanRequestDto = exports.GeneratePlanResponseDto = exports.GeneratePlanRequestDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class GeneratePlanRequestDto {
}
exports.GeneratePlanRequestDto = GeneratePlanRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '旅行世界状态',
        example: {
            context: {
                destination: 'IS',
                startDate: '2026-01-02',
                durationDays: 7,
                preferences: {
                    intents: { nature: 0.8, culture: 0.4 },
                    pace: 'moderate',
                    riskTolerance: 'medium',
                },
                budget: {
                    amount: 50000,
                    currency: 'CNY',
                },
            },
            candidatesByDate: {
                '2026-01-02': [],
            },
            signals: {
                lastUpdatedAt: new Date().toISOString(),
            },
        },
    }),
    __metadata("design:type", Object)
], GeneratePlanRequestDto.prototype, "state", void 0);
class GeneratePlanResponseDto {
}
exports.GeneratePlanResponseDto = GeneratePlanResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '生成的计划' }),
    __metadata("design:type", Object)
], GeneratePlanResponseDto.prototype, "plan", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '决策日志' }),
    __metadata("design:type", Object)
], GeneratePlanResponseDto.prototype, "log", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '三人格策略决策日志',
        type: [Object],
        example: [
            {
                persona: 'ABU',
                action: 'ALLOW',
                explanation: '未发现硬性风险问题，允许继续',
                reasonCodes: [],
                timestamp: '2026-01-01T00:00:00.000Z',
            },
        ],
    }),
    __metadata("design:type", Array)
], GeneratePlanResponseDto.prototype, "decisionLogs", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '路线方向选择解释',
        example: '选择了冰岛高地 F 路穿越路线方向，因为匹配了您的冒险偏好和中等风险容忍度',
    }),
    __metadata("design:type", String)
], GeneratePlanResponseDto.prototype, "routeDirectionExplanation", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '旅行准备度检查清单',
        type: Object,
    }),
    __metadata("design:type", Object)
], GeneratePlanResponseDto.prototype, "readiness", void 0);
class RepairPlanRequestDto {
}
exports.RepairPlanRequestDto = RepairPlanRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '旅行世界状态' }),
    __metadata("design:type", Object)
], RepairPlanRequestDto.prototype, "state", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '当前计划' }),
    __metadata("design:type", Object)
], RepairPlanRequestDto.prototype, "plan", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '触发原因',
        enum: ['initial_generate', 'user_edit', 'signal_update', 'availability_update', 'time_overrun', 'budget_overrun', 'manual_repair'],
        default: 'signal_update',
    }),
    __metadata("design:type", String)
], RepairPlanRequestDto.prototype, "trigger", void 0);
class ExplainPlanRequestDto {
}
exports.ExplainPlanRequestDto = ExplainPlanRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '计划' }),
    __metadata("design:type", Object)
], ExplainPlanRequestDto.prototype, "plan", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '决策日志' }),
    __metadata("design:type", Object)
], ExplainPlanRequestDto.prototype, "log", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '约束违规列表' }),
    __metadata("design:type", Array)
], ExplainPlanRequestDto.prototype, "violations", void 0);
class ExplainPlanResponseDto {
}
exports.ExplainPlanResponseDto = ExplainPlanResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '计划解释' }),
    __metadata("design:type", Object)
], ExplainPlanResponseDto.prototype, "explanation", void 0);
class LearnFromLogsRequestDto {
}
exports.LearnFromLogsRequestDto = LearnFromLogsRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '决策日志列表' }),
    __metadata("design:type", Array)
], LearnFromLogsRequestDto.prototype, "logs", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '用户反馈' }),
    __metadata("design:type", Array)
], LearnFromLogsRequestDto.prototype, "userFeedback", void 0);
class LearnFromLogsResponseDto {
}
exports.LearnFromLogsResponseDto = LearnFromLogsResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '学习结果' }),
    __metadata("design:type", Object)
], LearnFromLogsResponseDto.prototype, "result", void 0);
class EvaluatePlanRequestDto {
}
exports.EvaluatePlanRequestDto = EvaluatePlanRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '旅行世界状态' }),
    __metadata("design:type", Object)
], EvaluatePlanRequestDto.prototype, "state", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '计划' }),
    __metadata("design:type", Object)
], EvaluatePlanRequestDto.prototype, "plan", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '约束检查结果' }),
    __metadata("design:type", Object)
], EvaluatePlanRequestDto.prototype, "constraintResult", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '计划差异' }),
    __metadata("design:type", Object)
], EvaluatePlanRequestDto.prototype, "diff", void 0);
class EvaluatePlanResponseDto {
}
exports.EvaluatePlanResponseDto = EvaluatePlanResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '计划指标' }),
    __metadata("design:type", Object)
], EvaluatePlanResponseDto.prototype, "metrics", void 0);
class CheckAdvancedConstraintsRequestDto {
}
exports.CheckAdvancedConstraintsRequestDto = CheckAdvancedConstraintsRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '计划' }),
    __metadata("design:type", Object)
], CheckAdvancedConstraintsRequestDto.prototype, "plan", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '高级约束配置' }),
    __metadata("design:type", Object)
], CheckAdvancedConstraintsRequestDto.prototype, "constraints", void 0);
class MonitoringMetricsResponseDto {
}
exports.MonitoringMetricsResponseDto = MonitoringMetricsResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '监控指标' }),
    __metadata("design:type", Object)
], MonitoringMetricsResponseDto.prototype, "metrics", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '告警列表' }),
    __metadata("design:type", Array)
], MonitoringMetricsResponseDto.prototype, "alerts", void 0);
//# sourceMappingURL=decision.dto.js.map