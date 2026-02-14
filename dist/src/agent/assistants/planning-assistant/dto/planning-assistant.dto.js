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
exports.SessionStateResponseDto = exports.PlanningChatResponseDto = exports.SuggestedActionDto = exports.PlanCandidateDto = exports.DestinationRecommendationDto = exports.GuidingQuestionDto = exports.CreateSessionResponseDto = exports.CreateSessionRequestDto = exports.PlanningChatRequestDto = exports.RequestContextDto = exports.LocationContextDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class LocationContextDto {
}
exports.LocationContextDto = LocationContextDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '纬度' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], LocationContextDto.prototype, "lat", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '经度' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], LocationContextDto.prototype, "lng", void 0);
class RequestContextDto {
}
exports.RequestContextDto = RequestContextDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '当前位置' }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => LocationContextDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", LocationContextDto)
], RequestContextDto.prototype, "currentLocation", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '时区' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RequestContextDto.prototype, "timezone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '行程ID（规划工作台场景下必需）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RequestContextDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '国家代码（ISO 3166-1 alpha-2，规划工作台场景下必需）', example: 'IS' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RequestContextDto.prototype, "countryCode", void 0);
class PlanningChatRequestDto {
}
exports.PlanningChatRequestDto = PlanningChatRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '会话ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PlanningChatRequestDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '用户ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PlanningChatRequestDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '用户消息' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PlanningChatRequestDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '语言偏好', enum: ['en', 'zh'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['en', 'zh']),
    __metadata("design:type", String)
], PlanningChatRequestDto.prototype, "language", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '请求上下文' }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => RequestContextDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", RequestContextDto)
], PlanningChatRequestDto.prototype, "context", void 0);
class CreateSessionRequestDto {
}
exports.CreateSessionRequestDto = CreateSessionRequestDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '用户ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateSessionRequestDto.prototype, "userId", void 0);
class CreateSessionResponseDto {
}
exports.CreateSessionResponseDto = CreateSessionResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '会话ID' }),
    __metadata("design:type", String)
], CreateSessionResponseDto.prototype, "sessionId", void 0);
class GuidingQuestionDto {
}
exports.GuidingQuestionDto = GuidingQuestionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '问题（英文）' }),
    __metadata("design:type", String)
], GuidingQuestionDto.prototype, "question", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '问题（中文）' }),
    __metadata("design:type", String)
], GuidingQuestionDto.prototype, "questionCN", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '选项（英文）' }),
    __metadata("design:type", Array)
], GuidingQuestionDto.prototype, "options", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '选项（中文）' }),
    __metadata("design:type", Array)
], GuidingQuestionDto.prototype, "optionsCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '输入类型', enum: ['single', 'multiple', 'text', 'date', 'number'] }),
    __metadata("design:type", String)
], GuidingQuestionDto.prototype, "type", void 0);
class DestinationRecommendationDto {
}
exports.DestinationRecommendationDto = DestinationRecommendationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '目的地ID' }),
    __metadata("design:type", String)
], DestinationRecommendationDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '国家代码' }),
    __metadata("design:type", String)
], DestinationRecommendationDto.prototype, "countryCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '名称（英文）' }),
    __metadata("design:type", String)
], DestinationRecommendationDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '名称（中文）' }),
    __metadata("design:type", String)
], DestinationRecommendationDto.prototype, "nameCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '描述（英文）' }),
    __metadata("design:type", String)
], DestinationRecommendationDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '描述（中文）' }),
    __metadata("design:type", String)
], DestinationRecommendationDto.prototype, "descriptionCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '亮点（英文）', type: [String] }),
    __metadata("design:type", Array)
], DestinationRecommendationDto.prototype, "highlights", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '亮点（中文）', type: [String] }),
    __metadata("design:type", Array)
], DestinationRecommendationDto.prototype, "highlightsCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '匹配分数 (0-100)' }),
    __metadata("design:type", Number)
], DestinationRecommendationDto.prototype, "matchScore", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '匹配原因（英文）', type: [String] }),
    __metadata("design:type", Array)
], DestinationRecommendationDto.prototype, "matchReasons", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '匹配原因（中文）', type: [String] }),
    __metadata("design:type", Array)
], DestinationRecommendationDto.prototype, "matchReasonsCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '预估预算' }),
    __metadata("design:type", Object)
], DestinationRecommendationDto.prototype, "estimatedBudget", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '最佳季节', type: [String] }),
    __metadata("design:type", Array)
], DestinationRecommendationDto.prototype, "bestSeasons", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '图片URL' }),
    __metadata("design:type", String)
], DestinationRecommendationDto.prototype, "imageUrl", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '标签', type: [String] }),
    __metadata("design:type", Array)
], DestinationRecommendationDto.prototype, "tags", void 0);
class PlanCandidateDto {
}
exports.PlanCandidateDto = PlanCandidateDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '方案ID' }),
    __metadata("design:type", String)
], PlanCandidateDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '方案名称（英文）' }),
    __metadata("design:type", String)
], PlanCandidateDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '方案名称（中文）' }),
    __metadata("design:type", String)
], PlanCandidateDto.prototype, "nameCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '方案描述（英文）' }),
    __metadata("design:type", String)
], PlanCandidateDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '方案描述（中文）' }),
    __metadata("design:type", String)
], PlanCandidateDto.prototype, "descriptionCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '目的地' }),
    __metadata("design:type", String)
], PlanCandidateDto.prototype, "destination", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '天数' }),
    __metadata("design:type", Number)
], PlanCandidateDto.prototype, "duration", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '亮点', type: [String] }),
    __metadata("design:type", Array)
], PlanCandidateDto.prototype, "highlights", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '预估预算' }),
    __metadata("design:type", Object)
], PlanCandidateDto.prototype, "estimatedBudget", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '节奏', enum: ['relaxed', 'moderate', 'intensive'] }),
    __metadata("design:type", String)
], PlanCandidateDto.prototype, "pace", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '适合度' }),
    __metadata("design:type", Object)
], PlanCandidateDto.prototype, "suitability", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '警告', type: [String] }),
    __metadata("design:type", Array)
], PlanCandidateDto.prototype, "warnings", void 0);
class SuggestedActionDto {
}
exports.SuggestedActionDto = SuggestedActionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '操作标识' }),
    __metadata("design:type", String)
], SuggestedActionDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '标签（英文）' }),
    __metadata("design:type", String)
], SuggestedActionDto.prototype, "label", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '标签（中文）' }),
    __metadata("design:type", String)
], SuggestedActionDto.prototype, "labelCN", void 0);
class PlanningChatResponseDto {
}
exports.PlanningChatResponseDto = PlanningChatResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '回复消息（英文）' }),
    __metadata("design:type", String)
], PlanningChatResponseDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '回复消息（中文）' }),
    __metadata("design:type", String)
], PlanningChatResponseDto.prototype, "messageCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '当前对话阶段' }),
    __metadata("design:type", String)
], PlanningChatResponseDto.prototype, "phase", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '引导问题', type: [GuidingQuestionDto] }),
    __metadata("design:type", Array)
], PlanningChatResponseDto.prototype, "guidingQuestions", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '目的地推荐', type: [DestinationRecommendationDto] }),
    __metadata("design:type", Array)
], PlanningChatResponseDto.prototype, "recommendations", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '方案候选', type: [PlanCandidateDto] }),
    __metadata("design:type", Array)
], PlanningChatResponseDto.prototype, "planCandidates", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '方案对比' }),
    __metadata("design:type", Object)
], PlanningChatResponseDto.prototype, "comparison", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '确认的行程ID' }),
    __metadata("design:type", String)
], PlanningChatResponseDto.prototype, "confirmedTripId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '建议操作', type: [SuggestedActionDto] }),
    __metadata("design:type", Array)
], PlanningChatResponseDto.prototype, "suggestedActions", void 0);
class SessionStateResponseDto {
}
exports.SessionStateResponseDto = SessionStateResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '会话ID' }),
    __metadata("design:type", String)
], SessionStateResponseDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '用户ID' }),
    __metadata("design:type", String)
], SessionStateResponseDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '当前阶段' }),
    __metadata("design:type", String)
], SessionStateResponseDto.prototype, "phase", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '用户偏好' }),
    __metadata("design:type", Object)
], SessionStateResponseDto.prototype, "preferences", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '目的地推荐', type: [DestinationRecommendationDto] }),
    __metadata("design:type", Array)
], SessionStateResponseDto.prototype, "recommendations", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '选中的目的地' }),
    __metadata("design:type", String)
], SessionStateResponseDto.prototype, "selectedDestination", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '方案候选', type: [PlanCandidateDto] }),
    __metadata("design:type", Array)
], SessionStateResponseDto.prototype, "planCandidates", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '选中的方案ID' }),
    __metadata("design:type", String)
], SessionStateResponseDto.prototype, "selectedPlanId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '确认的行程ID' }),
    __metadata("design:type", String)
], SessionStateResponseDto.prototype, "confirmedTripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '消息历史数量' }),
    __metadata("design:type", Number)
], SessionStateResponseDto.prototype, "messageCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '创建时间' }),
    __metadata("design:type", String)
], SessionStateResponseDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '更新时间' }),
    __metadata("design:type", String)
], SessionStateResponseDto.prototype, "updatedAt", void 0);
//# sourceMappingURL=planning-assistant.dto.js.map