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
exports.ApplySuggestionResponseDto = exports.ImpactAnalysisDto = exports.ImpactRiskDto = exports.ImpactMetricsDto = exports.AppliedChangeDto = exports.ApplySuggestionRequestDto = exports.SuggestionStatsDto = exports.SuggestionListResponseDto = exports.SuggestionDto = exports.RefreshPolicyDto = exports.SuggestionActionDto = exports.EvidenceLinkDto = exports.SuggestionStatus = exports.SuggestionSeverity = exports.SuggestionScope = exports.SuggestionPersona = void 0;
const swagger_1 = require("@nestjs/swagger");
var SuggestionPersona;
(function (SuggestionPersona) {
    SuggestionPersona["ABU"] = "abu";
    SuggestionPersona["DR_DRE"] = "drdre";
    SuggestionPersona["NEPTUNE"] = "neptune";
})(SuggestionPersona || (exports.SuggestionPersona = SuggestionPersona = {}));
var SuggestionScope;
(function (SuggestionScope) {
    SuggestionScope["TRIP"] = "trip";
    SuggestionScope["DAY"] = "day";
    SuggestionScope["ITEM"] = "item";
    SuggestionScope["SEGMENT"] = "segment";
})(SuggestionScope || (exports.SuggestionScope = SuggestionScope = {}));
var SuggestionSeverity;
(function (SuggestionSeverity) {
    SuggestionSeverity["INFO"] = "info";
    SuggestionSeverity["WARN"] = "warn";
    SuggestionSeverity["BLOCKER"] = "blocker";
})(SuggestionSeverity || (exports.SuggestionSeverity = SuggestionSeverity = {}));
var SuggestionStatus;
(function (SuggestionStatus) {
    SuggestionStatus["NEW"] = "new";
    SuggestionStatus["SEEN"] = "seen";
    SuggestionStatus["APPLIED"] = "applied";
    SuggestionStatus["DISMISSED"] = "dismissed";
})(SuggestionStatus || (exports.SuggestionStatus = SuggestionStatus = {}));
class EvidenceLinkDto {
}
exports.EvidenceLinkDto = EvidenceLinkDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '证据ID' }),
    __metadata("design:type", String)
], EvidenceLinkDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '证据类型', enum: ['opening_hours', 'road_closure', 'weather', 'booking', 'other'] }),
    __metadata("design:type", String)
], EvidenceLinkDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '标题' }),
    __metadata("design:type", String)
], EvidenceLinkDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '描述' }),
    __metadata("design:type", String)
], EvidenceLinkDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '链接' }),
    __metadata("design:type", String)
], EvidenceLinkDto.prototype, "link", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '来源' }),
    __metadata("design:type", String)
], EvidenceLinkDto.prototype, "source", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '时间戳' }),
    __metadata("design:type", String)
], EvidenceLinkDto.prototype, "timestamp", void 0);
class SuggestionActionDto {
}
exports.SuggestionActionDto = SuggestionActionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '操作ID' }),
    __metadata("design:type", String)
], SuggestionActionDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '操作标签' }),
    __metadata("design:type", String)
], SuggestionActionDto.prototype, "label", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '操作类型', enum: ['apply', 'preview', 'dismiss', 'snooze', 'view_evidence', 'adjust_rhythm', 'view_alternatives'] }),
    __metadata("design:type", String)
], SuggestionActionDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否为主要操作' }),
    __metadata("design:type", Boolean)
], SuggestionActionDto.prototype, "primary", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '图标' }),
    __metadata("design:type", String)
], SuggestionActionDto.prototype, "icon", void 0);
class RefreshPolicyDto {
}
exports.RefreshPolicyDto = RefreshPolicyDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '触发重新计算的事件列表', type: [String] }),
    __metadata("design:type", Array)
], RefreshPolicyDto.prototype, "triggers", void 0);
class SuggestionDto {
}
exports.SuggestionDto = SuggestionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '建议唯一ID' }),
    __metadata("design:type", String)
], SuggestionDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '来源人格', enum: SuggestionPersona }),
    __metadata("design:type", String)
], SuggestionDto.prototype, "persona", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '作用范围', enum: SuggestionScope }),
    __metadata("design:type", String)
], SuggestionDto.prototype, "scope", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '作用范围ID' }),
    __metadata("design:type", String)
], SuggestionDto.prototype, "scopeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '严重级别', enum: SuggestionSeverity }),
    __metadata("design:type", String)
], SuggestionDto.prototype, "severity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '状态', enum: SuggestionStatus }),
    __metadata("design:type", String)
], SuggestionDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '标题' }),
    __metadata("design:type", String)
], SuggestionDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '摘要' }),
    __metadata("design:type", String)
], SuggestionDto.prototype, "summary", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '详细描述' }),
    __metadata("design:type", String)
], SuggestionDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '证据链', type: [EvidenceLinkDto] }),
    __metadata("design:type", Array)
], SuggestionDto.prototype, "evidence", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '可执行的操作列表', type: [SuggestionActionDto] }),
    __metadata("design:type", Array)
], SuggestionDto.prototype, "actions", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '创建时间' }),
    __metadata("design:type", String)
], SuggestionDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '更新时间' }),
    __metadata("design:type", String)
], SuggestionDto.prototype, "updatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '刷新策略', type: RefreshPolicyDto }),
    __metadata("design:type", RefreshPolicyDto)
], SuggestionDto.prototype, "refreshPolicy", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '元数据', type: Object }),
    __metadata("design:type", Object)
], SuggestionDto.prototype, "metadata", void 0);
class SuggestionListResponseDto {
}
exports.SuggestionListResponseDto = SuggestionListResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '建议列表', type: [SuggestionDto] }),
    __metadata("design:type", Array)
], SuggestionListResponseDto.prototype, "items", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总数' }),
    __metadata("design:type", Number)
], SuggestionListResponseDto.prototype, "total", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '应用的过滤器' }),
    __metadata("design:type", Object)
], SuggestionListResponseDto.prototype, "filters", void 0);
class SuggestionStatsDto {
}
exports.SuggestionStatsDto = SuggestionStatsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程ID' }),
    __metadata("design:type", String)
], SuggestionStatsDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '按人格统计' }),
    __metadata("design:type", Object)
], SuggestionStatsDto.prototype, "byPersona", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '按作用范围统计' }),
    __metadata("design:type", Object)
], SuggestionStatsDto.prototype, "byScope", void 0);
class ApplySuggestionRequestDto {
}
exports.ApplySuggestionRequestDto = ApplySuggestionRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '要执行的操作ID' }),
    __metadata("design:type", String)
], ApplySuggestionRequestDto.prototype, "actionId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '操作参数', type: Object }),
    __metadata("design:type", Object)
], ApplySuggestionRequestDto.prototype, "params", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否只是预览，不实际应用', default: false }),
    __metadata("design:type", Boolean)
], ApplySuggestionRequestDto.prototype, "preview", void 0);
class AppliedChangeDto {
}
exports.AppliedChangeDto = AppliedChangeDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '变更类型' }),
    __metadata("design:type", String)
], AppliedChangeDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '变更描述' }),
    __metadata("design:type", String)
], AppliedChangeDto.prototype, "description", void 0);
class ImpactMetricsDto {
}
exports.ImpactMetricsDto = ImpactMetricsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '疲劳指数变化' }),
    __metadata("design:type", Number)
], ImpactMetricsDto.prototype, "fatigue", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '缓冲时间变化（分钟）' }),
    __metadata("design:type", Number)
], ImpactMetricsDto.prototype, "buffer", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '费用变化' }),
    __metadata("design:type", Number)
], ImpactMetricsDto.prototype, "cost", void 0);
class ImpactRiskDto {
}
exports.ImpactRiskDto = ImpactRiskDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '风险ID' }),
    __metadata("design:type", String)
], ImpactRiskDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '严重级别', enum: SuggestionSeverity }),
    __metadata("design:type", String)
], ImpactRiskDto.prototype, "severity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '标题' }),
    __metadata("design:type", String)
], ImpactRiskDto.prototype, "title", void 0);
class ImpactAnalysisDto {
}
exports.ImpactAnalysisDto = ImpactAnalysisDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '指标变化', type: ImpactMetricsDto }),
    __metadata("design:type", ImpactMetricsDto)
], ImpactAnalysisDto.prototype, "metrics", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '风险列表', type: [ImpactRiskDto] }),
    __metadata("design:type", Array)
], ImpactAnalysisDto.prototype, "risks", void 0);
class ApplySuggestionResponseDto {
}
exports.ApplySuggestionResponseDto = ApplySuggestionResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否成功' }),
    __metadata("design:type", Boolean)
], ApplySuggestionResponseDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '建议ID' }),
    __metadata("design:type", String)
], ApplySuggestionResponseDto.prototype, "suggestionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '应用的变更列表', type: [AppliedChangeDto] }),
    __metadata("design:type", Array)
], ApplySuggestionResponseDto.prototype, "appliedChanges", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '影响分析', type: ImpactAnalysisDto }),
    __metadata("design:type", ImpactAnalysisDto)
], ApplySuggestionResponseDto.prototype, "impact", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '应用后自动触发的其他建议ID列表', type: [String] }),
    __metadata("design:type", Array)
], ApplySuggestionResponseDto.prototype, "triggeredSuggestions", void 0);
//# sourceMappingURL=suggestions.dto.js.map