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
exports.JourneyAssistantResponseDto = exports.SearchResultsDto = exports.AdjustmentResultDto = exports.JourneySuggestedActionDto = exports.JourneyStateDto = exports.JourneyStatsDto = exports.EmergencyOptionDto = exports.TripEventDto = exports.ReminderDto = exports.ScheduleItemDto = exports.AdjustScheduleRequestDto = exports.HandleEventRequestDto = exports.JourneyChatRequestDto = exports.JourneyBaseRequestDto = exports.AdjustmentParamsDto = exports.JourneyContextDto = exports.LocationDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class LocationDto {
}
exports.LocationDto = LocationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '纬度' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], LocationDto.prototype, "lat", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '经度' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], LocationDto.prototype, "lng", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '位置名称' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LocationDto.prototype, "name", void 0);
class JourneyContextDto {
}
exports.JourneyContextDto = JourneyContextDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '当前位置' }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => LocationDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", LocationDto)
], JourneyContextDto.prototype, "currentLocation", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '时区' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], JourneyContextDto.prototype, "timezone", void 0);
class AdjustmentParamsDto {
}
exports.AdjustmentParamsDto = AdjustmentParamsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程项ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdjustmentParamsDto.prototype, "itemId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '新时间' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdjustmentParamsDto.prototype, "newTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否取消' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdjustmentParamsDto.prototype, "cancel", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '替换内容' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], AdjustmentParamsDto.prototype, "replace", void 0);
class JourneyBaseRequestDto {
}
exports.JourneyBaseRequestDto = JourneyBaseRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], JourneyBaseRequestDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '用户ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], JourneyBaseRequestDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '语言偏好', enum: ['en', 'zh'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['en', 'zh']),
    __metadata("design:type", String)
], JourneyBaseRequestDto.prototype, "language", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '请求上下文' }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => JourneyContextDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", JourneyContextDto)
], JourneyBaseRequestDto.prototype, "context", void 0);
class JourneyChatRequestDto extends JourneyBaseRequestDto {
}
exports.JourneyChatRequestDto = JourneyChatRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '用户消息' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], JourneyChatRequestDto.prototype, "message", void 0);
class HandleEventRequestDto extends JourneyBaseRequestDto {
}
exports.HandleEventRequestDto = HandleEventRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '事件ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], HandleEventRequestDto.prototype, "eventId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '选择的方案ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], HandleEventRequestDto.prototype, "selectedOptionId", void 0);
class AdjustScheduleRequestDto extends JourneyBaseRequestDto {
}
exports.AdjustScheduleRequestDto = AdjustScheduleRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '调整参数' }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => AdjustmentParamsDto),
    __metadata("design:type", AdjustmentParamsDto)
], AdjustScheduleRequestDto.prototype, "adjustmentParams", void 0);
class ScheduleItemDto {
}
exports.ScheduleItemDto = ScheduleItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程项ID' }),
    __metadata("design:type", String)
], ScheduleItemDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '类型', enum: ['flight', 'hotel', 'activity', 'transport', 'meal', 'rest'] }),
    __metadata("design:type", String)
], ScheduleItemDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '标题（英文）' }),
    __metadata("design:type", String)
], ScheduleItemDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '标题（中文）' }),
    __metadata("design:type", String)
], ScheduleItemDto.prototype, "titleCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '开始时间' }),
    __metadata("design:type", String)
], ScheduleItemDto.prototype, "startTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '结束时间' }),
    __metadata("design:type", String)
], ScheduleItemDto.prototype, "endTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '位置' }),
    __metadata("design:type", Object)
], ScheduleItemDto.prototype, "location", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '状态', enum: ['upcoming', 'in_progress', 'completed', 'cancelled', 'modified'] }),
    __metadata("design:type", String)
], ScheduleItemDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '备注（英文）' }),
    __metadata("design:type", String)
], ScheduleItemDto.prototype, "notes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '备注（中文）' }),
    __metadata("design:type", String)
], ScheduleItemDto.prototype, "notesCN", void 0);
class ReminderDto {
}
exports.ReminderDto = ReminderDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '提醒ID' }),
    __metadata("design:type", String)
], ReminderDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '类型' }),
    __metadata("design:type", String)
], ReminderDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '标题（英文）' }),
    __metadata("design:type", String)
], ReminderDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '标题（中文）' }),
    __metadata("design:type", String)
], ReminderDto.prototype, "titleCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '消息（英文）' }),
    __metadata("design:type", String)
], ReminderDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '消息（中文）' }),
    __metadata("design:type", String)
], ReminderDto.prototype, "messageCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '优先级', enum: ['low', 'medium', 'high', 'urgent'] }),
    __metadata("design:type", String)
], ReminderDto.prototype, "priority", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '计划时间' }),
    __metadata("design:type", String)
], ReminderDto.prototype, "scheduledAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '关联项目ID' }),
    __metadata("design:type", String)
], ReminderDto.prototype, "relatedItemId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否需要操作' }),
    __metadata("design:type", Boolean)
], ReminderDto.prototype, "actionRequired", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '可用操作' }),
    __metadata("design:type", Array)
], ReminderDto.prototype, "actions", void 0);
class TripEventDto {
}
exports.TripEventDto = TripEventDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '事件ID' }),
    __metadata("design:type", String)
], TripEventDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '事件类型' }),
    __metadata("design:type", String)
], TripEventDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '标题（英文）' }),
    __metadata("design:type", String)
], TripEventDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '标题（中文）' }),
    __metadata("design:type", String)
], TripEventDto.prototype, "titleCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '描述（英文）' }),
    __metadata("design:type", String)
], TripEventDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '描述（中文）' }),
    __metadata("design:type", String)
], TripEventDto.prototype, "descriptionCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '严重程度', enum: ['info', 'warning', 'critical'] }),
    __metadata("design:type", String)
], TripEventDto.prototype, "severity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '发生时间' }),
    __metadata("design:type", String)
], TripEventDto.prototype, "occurredAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '影响的项目', type: [String] }),
    __metadata("design:type", Array)
], TripEventDto.prototype, "affectedItems", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '来源' }),
    __metadata("design:type", String)
], TripEventDto.prototype, "source", void 0);
class EmergencyOptionDto {
}
exports.EmergencyOptionDto = EmergencyOptionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '方案ID' }),
    __metadata("design:type", String)
], EmergencyOptionDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '方案名称（英文）' }),
    __metadata("design:type", String)
], EmergencyOptionDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '方案名称（中文）' }),
    __metadata("design:type", String)
], EmergencyOptionDto.prototype, "nameCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '方案描述（英文）' }),
    __metadata("design:type", String)
], EmergencyOptionDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '方案描述（中文）' }),
    __metadata("design:type", String)
], EmergencyOptionDto.prototype, "descriptionCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '影响（英文）' }),
    __metadata("design:type", Object)
], EmergencyOptionDto.prototype, "impact", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '影响（中文）' }),
    __metadata("design:type", Object)
], EmergencyOptionDto.prototype, "impactCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否推荐' }),
    __metadata("design:type", Boolean)
], EmergencyOptionDto.prototype, "recommended", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '可用操作' }),
    __metadata("design:type", Array)
], EmergencyOptionDto.prototype, "actions", void 0);
class JourneyStatsDto {
}
exports.JourneyStatsDto = JourneyStatsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '已完成活动数' }),
    __metadata("design:type", Number)
], JourneyStatsDto.prototype, "completedActivities", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总活动数' }),
    __metadata("design:type", Number)
], JourneyStatsDto.prototype, "totalActivities", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '已花费预算' }),
    __metadata("design:type", Number)
], JourneyStatsDto.prototype, "spentBudget", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总预算' }),
    __metadata("design:type", Number)
], JourneyStatsDto.prototype, "totalBudget", void 0);
class JourneyStateDto {
}
exports.JourneyStateDto = JourneyStateDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程ID' }),
    __metadata("design:type", String)
], JourneyStateDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '用户ID' }),
    __metadata("design:type", String)
], JourneyStateDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '当前阶段', enum: ['PRE_TRIP', 'DEPARTURE_DAY', 'ON_TRIP', 'RETURN_DAY', 'POST_TRIP'] }),
    __metadata("design:type", String)
], JourneyStateDto.prototype, "phase", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '当前天数' }),
    __metadata("design:type", Number)
], JourneyStateDto.prototype, "currentDay", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总天数' }),
    __metadata("design:type", Number)
], JourneyStateDto.prototype, "totalDays", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '当前日期' }),
    __metadata("design:type", String)
], JourneyStateDto.prototype, "currentDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '当前位置' }),
    __metadata("design:type", LocationDto)
], JourneyStateDto.prototype, "currentLocation", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '今日行程', type: [ScheduleItemDto] }),
    __metadata("design:type", Array)
], JourneyStateDto.prototype, "todaySchedule", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '即将到来的提醒', type: [ReminderDto] }),
    __metadata("design:type", Array)
], JourneyStateDto.prototype, "upcomingReminders", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '活跃事件', type: [TripEventDto] }),
    __metadata("design:type", Array)
], JourneyStateDto.prototype, "activeEvents", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程统计' }),
    __metadata("design:type", JourneyStatsDto)
], JourneyStateDto.prototype, "stats", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '最后更新时间' }),
    __metadata("design:type", String)
], JourneyStateDto.prototype, "lastUpdated", void 0);
class JourneySuggestedActionDto {
}
exports.JourneySuggestedActionDto = JourneySuggestedActionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '操作标识' }),
    __metadata("design:type", String)
], JourneySuggestedActionDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '标签（英文）' }),
    __metadata("design:type", String)
], JourneySuggestedActionDto.prototype, "label", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '标签（中文）' }),
    __metadata("design:type", String)
], JourneySuggestedActionDto.prototype, "labelCN", void 0);
class AdjustmentResultDto {
}
exports.AdjustmentResultDto = AdjustmentResultDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否成功' }),
    __metadata("design:type", Boolean)
], AdjustmentResultDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '消息（英文）' }),
    __metadata("design:type", String)
], AdjustmentResultDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '消息（中文）' }),
    __metadata("design:type", String)
], AdjustmentResultDto.prototype, "messageCN", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '更新后的行程', type: [ScheduleItemDto] }),
    __metadata("design:type", Array)
], AdjustmentResultDto.prototype, "updatedSchedule", void 0);
class SearchResultsDto {
}
exports.SearchResultsDto = SearchResultsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '搜索类型' }),
    __metadata("design:type", String)
], SearchResultsDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '搜索结果' }),
    __metadata("design:type", Array)
], SearchResultsDto.prototype, "items", void 0);
class JourneyAssistantResponseDto {
}
exports.JourneyAssistantResponseDto = JourneyAssistantResponseDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '回复消息（英文）' }),
    __metadata("design:type", String)
], JourneyAssistantResponseDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '回复消息（中文）' }),
    __metadata("design:type", String)
], JourneyAssistantResponseDto.prototype, "messageCN", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '行程状态' }),
    __metadata("design:type", JourneyStateDto)
], JourneyAssistantResponseDto.prototype, "journeyState", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '提醒列表', type: [ReminderDto] }),
    __metadata("design:type", Array)
], JourneyAssistantResponseDto.prototype, "reminders", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '事件信息' }),
    __metadata("design:type", TripEventDto)
], JourneyAssistantResponseDto.prototype, "event", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '应急方案', type: [EmergencyOptionDto] }),
    __metadata("design:type", Array)
], JourneyAssistantResponseDto.prototype, "options", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '调整结果' }),
    __metadata("design:type", AdjustmentResultDto)
], JourneyAssistantResponseDto.prototype, "adjustmentResult", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '搜索结果' }),
    __metadata("design:type", SearchResultsDto)
], JourneyAssistantResponseDto.prototype, "searchResults", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '建议操作', type: [JourneySuggestedActionDto] }),
    __metadata("design:type", Array)
], JourneyAssistantResponseDto.prototype, "suggestedActions", void 0);
//# sourceMappingURL=journey-assistant.dto.js.map