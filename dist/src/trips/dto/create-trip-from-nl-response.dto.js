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
exports.CreateTripFromNLResponseDto = exports.ClarificationQuestionDto = exports.PlannerResponseBlockDto = exports.ItineraryOverviewDto = exports.BudgetSummaryDto = exports.BudgetInfoDto = exports.SummaryCardDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const swagger_1 = require("@nestjs/swagger");
class SummaryCardDto {
}
exports.SummaryCardDto = SummaryCardDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '目的地' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SummaryCardDto.prototype, "destination", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '行程天数，如"10天"' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SummaryCardDto.prototype, "duration", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '旅行者信息，如"双人"' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SummaryCardDto.prototype, "travelers", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '预算信息' }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => BudgetInfoDto),
    __metadata("design:type", BudgetInfoDto)
], SummaryCardDto.prototype, "budget", void 0);
class BudgetInfoDto {
}
exports.BudgetInfoDto = BudgetInfoDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '预算金额' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], BudgetInfoDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '货币单位' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BudgetInfoDto.prototype, "currency", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '预算详情列表', type: [String] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], BudgetInfoDto.prototype, "details", void 0);
class BudgetSummaryDto {
}
exports.BudgetSummaryDto = BudgetSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '估算总金额' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], BudgetSummaryDto.prototype, "estimatedAmount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '货币单位' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BudgetSummaryDto.prototype, "currency", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程天数' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BudgetSummaryDto.prototype, "duration", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '旅行者信息' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BudgetSummaryDto.prototype, "travelers", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '预算分类明细' }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], BudgetSummaryDto.prototype, "breakdown", void 0);
class ItineraryOverviewDto {
}
exports.ItineraryOverviewDto = ItineraryOverviewDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '行程主题' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ItineraryOverviewDto.prototype, "theme", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '路线描述' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ItineraryOverviewDto.prototype, "route", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '每日结构描述' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ItineraryOverviewDto.prototype, "dailyStructure", void 0);
class PlannerResponseBlockDto {
}
exports.PlannerResponseBlockDto = PlannerResponseBlockDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '内容块类型',
        enum: ['paragraph', 'heading', 'list', 'summary_card', 'question_card', 'highlight', 'budget_summary', 'itinerary_overview'],
    }),
    (0, class_validator_1.IsEnum)(['paragraph', 'heading', 'list', 'summary_card', 'question_card', 'highlight', 'budget_summary', 'itinerary_overview']),
    __metadata("design:type", String)
], PlannerResponseBlockDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '内容块ID（用于前端渲染key）' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], PlannerResponseBlockDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '段落文本内容（paragraph类型）' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], PlannerResponseBlockDto.prototype, "content", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '标题级别（heading类型）', enum: [1, 2, 3] }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], PlannerResponseBlockDto.prototype, "level", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '标题文本（heading类型）' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], PlannerResponseBlockDto.prototype, "text", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '列表标题（list类型）' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], PlannerResponseBlockDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '列表项（list类型）', type: [String] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], PlannerResponseBlockDto.prototype, "items", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否有序列表（list类型）' }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], PlannerResponseBlockDto.prototype, "ordered", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '摘要信息（summary_card类型）', type: SummaryCardDto }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => SummaryCardDto),
    __metadata("design:type", SummaryCardDto)
], PlannerResponseBlockDto.prototype, "summary", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '关联的问题ID（question_card类型，关联到clarificationQuestions）' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], PlannerResponseBlockDto.prototype, "questionId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '高亮文本（highlight类型）' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], PlannerResponseBlockDto.prototype, "highlightText", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '高亮类型（highlight类型）',
        enum: ['info', 'warning', 'success'],
    }),
    (0, class_validator_1.IsEnum)(['info', 'warning', 'success']),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], PlannerResponseBlockDto.prototype, "highlightType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '预算摘要（budget_summary类型）', type: BudgetSummaryDto }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => BudgetSummaryDto),
    __metadata("design:type", BudgetSummaryDto)
], PlannerResponseBlockDto.prototype, "budget", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '行程概览（itinerary_overview类型）', type: ItineraryOverviewDto }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => ItineraryOverviewDto),
    __metadata("design:type", ItineraryOverviewDto)
], PlannerResponseBlockDto.prototype, "itinerary", void 0);
class ClarificationQuestionDto {
}
exports.ClarificationQuestionDto = ClarificationQuestionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '问题ID（唯一标识）' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ClarificationQuestionDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '问题文本（用户看到的问题）' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ClarificationQuestionDto.prototype, "question", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '问题类型',
        enum: ['text', 'single_choice', 'multi_choice', 'date', 'number'],
    }),
    (0, class_validator_1.IsEnum)(['text', 'single_choice', 'multi_choice', 'date', 'number']),
    __metadata("design:type", String)
], ClarificationQuestionDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '选项列表（用于single_choice和multi_choice）', type: [String] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], ClarificationQuestionDto.prototype, "options", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否必填' }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ClarificationQuestionDto.prototype, "required", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '占位符（用于text和number）' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ClarificationQuestionDto.prototype, "placeholder", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '提示文本（帮助用户理解问题）' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ClarificationQuestionDto.prototype, "hint", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '默认值' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], ClarificationQuestionDto.prototype, "default", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '元数据（category, priority等）' }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], ClarificationQuestionDto.prototype, "metadata", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '问题分组（required=必需问题，optional=可选问题）',
        enum: ['required', 'optional'],
    }),
    (0, class_validator_1.IsEnum)(['required', 'optional']),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ClarificationQuestionDto.prototype, "group", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '条件输入字段配置',
        type: [Object],
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], ClarificationQuestionDto.prototype, "conditionalInputs", void 0);
class CreateTripFromNLResponseDto {
}
exports.CreateTripFromNLResponseDto = CreateTripFromNLResponseDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '会话ID' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTripFromNLResponseDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否需要澄清' }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateTripFromNLResponseDto.prototype, "needsClarification", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '结构化回复内容块数组',
        type: [PlannerResponseBlockDto],
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => PlannerResponseBlockDto),
    __metadata("design:type", Array)
], CreateTripFromNLResponseDto.prototype, "plannerResponseBlocks", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '简单文本回复（向后兼容，如果未提供plannerResponseBlocks则使用此字段）',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTripFromNLResponseDto.prototype, "plannerReply", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '结构化澄清问题数组',
        type: [ClarificationQuestionDto],
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => ClarificationQuestionDto),
    __metadata("design:type", Array)
], CreateTripFromNLResponseDto.prototype, "clarificationQuestions", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '建议问题（向后兼容）', type: [String] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], CreateTripFromNLResponseDto.prototype, "suggestedQuestions", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '对话上下文' }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateTripFromNLResponseDto.prototype, "conversationContext", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '部分参数' }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateTripFromNLResponseDto.prototype, "partialParams", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '行程对象（如果创建成功）' }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateTripFromNLResponseDto.prototype, "trip", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否正在生成规划点' }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateTripFromNLResponseDto.prototype, "generatingItems", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '消息提示' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTripFromNLResponseDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '酒店推荐列表',
        type: [Object],
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], CreateTripFromNLResponseDto.prototype, "hotelRecommendations", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '用户画像信息（AI识别结果）',
        type: Object,
    }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateTripFromNLResponseDto.prototype, "personaInfo", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '推荐路线列表（基于用户画像）',
        type: [Object],
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], CreateTripFromNLResponseDto.prototype, "recommendedRoutes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否被安全第一原则阻止',
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateTripFromNLResponseDto.prototype, "blockedBySafetyPrinciple", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '决策矩阵结果（所有澄清轮次完成后）',
        type: Object,
    }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateTripFromNLResponseDto.prototype, "decisionResult", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否被决策矩阵阻止',
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateTripFromNLResponseDto.prototype, "blockedByDecisionMatrix", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '最后一条消息的ID（用于前端更新问题答案）',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTripFromNLResponseDto.prototype, "lastMessageId", void 0);
//# sourceMappingURL=create-trip-from-nl-response.dto.js.map