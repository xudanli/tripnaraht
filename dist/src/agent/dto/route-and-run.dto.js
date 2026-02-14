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
exports.RouteAndRunResponseDto = exports.RouteAndRunRequestDto = exports.AgentOptionsDto = exports.ConversationContextDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const swagger_1 = require("@nestjs/swagger");
const router_output_dto_1 = require("./router-output.dto");
class ConversationContextDto {
}
exports.ConversationContextDto = ConversationContextDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '最近的对话消息历史',
        type: [String],
        example: ['用户: 推荐新宿拉面', '助手: 我为您推荐...'],
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], ConversationContextDto.prototype, "recent_messages", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '用户语言环境',
        example: 'zh-CN',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ConversationContextDto.prototype, "locale", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '用户时区',
        example: 'Asia/Tokyo',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ConversationContextDto.prototype, "timezone", void 0);
class AgentOptionsDto {
}
exports.AgentOptionsDto = AgentOptionsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否仅执行 dry-run（不实际执行操作）',
        example: false,
        default: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AgentOptionsDto.prototype, "dry_run", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否允许使用浏览器（需要用户授权）',
        example: false,
        default: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AgentOptionsDto.prototype, "allow_webbrowse", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'System 2 最大执行时间（秒）',
        example: 60,
        default: 60,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], AgentOptionsDto.prototype, "max_seconds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'System 2 最大执行步数',
        example: 8,
        default: 8,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], AgentOptionsDto.prototype, "max_steps", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '浏览器操作最大步数',
        example: 12,
        default: 12,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], AgentOptionsDto.prototype, "max_browser_steps", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '成本预算（美元）',
        example: 0.1,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], AgentOptionsDto.prototype, "cost_budget_usd", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'LLM 提供商（auto/openai/deepseek/gemini/anthropic），auto 表示使用系统推荐的模型',
        example: 'auto',
        enum: ['auto', 'openai', 'deepseek', 'gemini', 'anthropic'],
        default: 'auto',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['auto', 'openai', 'deepseek', 'gemini', 'anthropic']),
    __metadata("design:type", String)
], AgentOptionsDto.prototype, "llm_provider", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否使用 Claude 编排（Feature Flag）',
        example: false,
        default: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AgentOptionsDto.prototype, "use_claude_orchestration", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否使用状态机编排（默认 true，仅在 use_claude_orchestration=true 时生效）',
        example: true,
        default: true,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AgentOptionsDto.prototype, "use_state_machine_orchestration", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '入口来源标识（用于权限控制和操作限制）',
        example: 'trip_detail_page',
        enum: ['trip_detail_page', 'trip_list_page', 'dashboard', 'planning_workbench'],
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['trip_detail_page', 'trip_list_page', 'dashboard', 'planning_workbench']),
    __metadata("design:type", String)
], AgentOptionsDto.prototype, "entry_point", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '只读模式标志（true 时限制为查询类操作）',
        example: true,
        default: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AgentOptionsDto.prototype, "readonly_mode", void 0);
class RouteAndRunRequestDto {
}
exports.RouteAndRunRequestDto = RouteAndRunRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '请求唯一标识符',
        example: 'req-001',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RouteAndRunRequestDto.prototype, "request_id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '用户 ID',
        example: 'user-123',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RouteAndRunRequestDto.prototype, "user_id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '关联的行程 ID（可选）',
        example: 'trip-456',
        nullable: true,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RouteAndRunRequestDto.prototype, "trip_id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '关联的路线方向 ID（可选，用于护城河扩展的失败风险预测）',
        example: 'route-dir-789',
        nullable: true,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RouteAndRunRequestDto.prototype, "route_direction_id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '用户输入消息',
        example: '推荐新宿拉面',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RouteAndRunRequestDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '对话上下文',
        type: ConversationContextDto,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => ConversationContextDto),
    __metadata("design:type", ConversationContextDto)
], RouteAndRunRequestDto.prototype, "conversation_context", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '智能体执行选项',
        type: AgentOptionsDto,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => AgentOptionsDto),
    __metadata("design:type", AgentOptionsDto)
], RouteAndRunRequestDto.prototype, "options", void 0);
class RouteAndRunResponseDto {
}
exports.RouteAndRunResponseDto = RouteAndRunResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '请求 ID（与请求中的 request_id 相同）',
        example: 'req-001',
    }),
    __metadata("design:type", String)
], RouteAndRunResponseDto.prototype, "request_id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '路由决策信息',
        type: router_output_dto_1.RouterOutputDto,
    }),
    __metadata("design:type", router_output_dto_1.RouterOutputDto)
], RouteAndRunResponseDto.prototype, "route", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'UI 状态（P1 改进：状态机步骤到 UI 状态的映射，用于前端加载状态显示）',
        example: {
            phase: 'GATE_EVAL',
            ui_status: 'verifying',
            progress_percent: 37.5,
            message: '正在评估行程可行性...',
            requires_user_action: false,
            estimated_time_remaining_ms: 15000,
            current_step_detail: '评估路线安全性、可达性和可行性（三人格评审）',
        },
    }),
    __metadata("design:type", Object)
], RouteAndRunResponseDto.prototype, "ui_state", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '执行结果',
        example: {
            status: 'OK',
            answer_text: '我为您推荐以下新宿拉面店...',
            payload: {
                timeline: [],
                dropped_items: [],
                candidates: [],
                evidence: [],
                robustness: null,
                orchestrationResult: {
                    state: {
                        request_id: 'req-001',
                        current_step: 'DONE',
                        itinerary: {
                            request_id: 'req-001',
                            days: [],
                        },
                        gate_result: {
                            gate_result: 'ALLOW',
                            violations: [],
                            required_adjustments: [],
                            confidence: 0.8,
                            evidence_refs: [],
                        },
                        narration: {
                            user_friendly_summary: '已为您生成行程安排',
                            day_by_day_narrative: [],
                            highlights: [],
                            tips: [],
                        },
                        decision_log: [],
                    },
                },
            },
        },
    }),
    __metadata("design:type", Object)
], RouteAndRunResponseDto.prototype, "result", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '决策解释（决策日志）',
        example: {
            decision_log: [
                {
                    step: 0,
                    chosen_action: 'places.resolve_entities',
                    reason_code: 'MISSING_POI_FACTS',
                    facts: {},
                    policy_id: 'FACTS_FIRST',
                },
            ],
            simplified_explanation: {
                summary: '行程已通过，进行了3项关键检查',
                key_decisions: [
                    { step: 'GATE_EVAL', decision: '已通过', impact: 'HIGH' },
                ],
                evidence_count: 5,
                has_details: true,
            },
        },
    }),
    __metadata("design:type", Object)
], RouteAndRunResponseDto.prototype, "explain", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '可观测性指标',
        example: {
            latency_ms: 190,
            router_ms: 2,
            system_mode: 'SYSTEM1',
            tool_calls: 1,
            browser_steps: 0,
            tokens_est: 0,
            cost_est_usd: 0.0,
            fallback_used: false,
            trace: {
                orchestration: {
                    mode: 'LEGACY',
                    reason: 'Claude orchestration disabled',
                    flags: {},
                },
                timestamp: '2024-01-13T10:00:00.000Z',
            },
        },
    }),
    __metadata("design:type", Object)
], RouteAndRunResponseDto.prototype, "observability", void 0);
//# sourceMappingURL=route-and-run.dto.js.map