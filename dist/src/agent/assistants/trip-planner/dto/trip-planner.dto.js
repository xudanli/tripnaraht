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
exports.ApplySuggestionDto = exports.SuggestionPlaceDto = exports.ConfirmChangesDto = exports.TripPlannerActionDto = exports.TripPlannerChatDto = exports.StartTripPlannerSessionDto = exports.ClarificationDataDto = exports.ClarificationParamsDto = exports.TimeSlotDto = exports.EnhancedContextDto = exports.CurrentLocationDto = exports.DayStatsDto = exports.FreeSlotDto = exports.AdjacentItemsDto = exports.AdjacentItemDto = exports.SelectedContextDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
class SelectedContextDto {
}
exports.SelectedContextDto = SelectedContextDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '选中的天数 (1-based)', example: 1 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], SelectedContextDto.prototype, "dayIndex", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '选中的日期', example: '2026-03-01' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SelectedContextDto.prototype, "date", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '选中的行程项 ID', example: 'item_浅草寺' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SelectedContextDto.prototype, "itemId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '选中的地点名称', example: '浅草寺' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SelectedContextDto.prototype, "placeName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '选中的行程项类型',
        enum: ['ACTIVITY', 'TRANSIT', 'MEAL_ANCHOR', 'MEAL_FLOATING', 'REST'],
        example: 'ACTIVITY',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SelectedContextDto.prototype, "itemType", void 0);
class AdjacentItemDto {
}
exports.AdjacentItemDto = AdjacentItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '名称', example: '浅草寺' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdjacentItemDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '结束时间 (ISO 8601)', example: '2026-03-01T11:00:00.000Z' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AdjacentItemDto.prototype, "endTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '开始时间 (ISO 8601)', example: '2026-03-01T12:00:00.000Z' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AdjacentItemDto.prototype, "startTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '类型', example: 'ACTIVITY' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AdjacentItemDto.prototype, "type", void 0);
class AdjacentItemsDto {
}
exports.AdjacentItemsDto = AdjacentItemsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '前一个行程项' }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => AdjacentItemDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", AdjacentItemDto)
], AdjacentItemsDto.prototype, "prevItem", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '后一个行程项' }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => AdjacentItemDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", AdjacentItemDto)
], AdjacentItemsDto.prototype, "nextItem", void 0);
class FreeSlotDto {
}
exports.FreeSlotDto = FreeSlotDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '开始时间 (HH:mm)', example: '14:00' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FreeSlotDto.prototype, "start", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '结束时间 (HH:mm)', example: '17:00' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FreeSlotDto.prototype, "end", void 0);
class DayStatsDto {
}
exports.DayStatsDto = DayStatsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总行程项数', example: 5 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], DayStatsDto.prototype, "totalItems", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否有用餐安排', example: true }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], DayStatsDto.prototype, "hasMeal", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否有交通安排', example: true }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], DayStatsDto.prototype, "hasTransit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '空闲时段列表', type: [FreeSlotDto] }),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => FreeSlotDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], DayStatsDto.prototype, "freeSlots", void 0);
class CurrentLocationDto {
}
exports.CurrentLocationDto = CurrentLocationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '纬度', example: 35.7147 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CurrentLocationDto.prototype, "lat", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '经度', example: 139.7967 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CurrentLocationDto.prototype, "lng", void 0);
class EnhancedContextDto {
}
exports.EnhancedContextDto = EnhancedContextDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '用户当前选中的上下文' }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => SelectedContextDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", SelectedContextDto)
], EnhancedContextDto.prototype, "selectedContext", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '前后衔接信息' }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => AdjacentItemsDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", AdjacentItemsDto)
], EnhancedContextDto.prototype, "adjacentItems", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '当天统计' }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DayStatsDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", DayStatsDto)
], EnhancedContextDto.prototype, "dayStats", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '当前位置' }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => CurrentLocationDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", CurrentLocationDto)
], EnhancedContextDto.prototype, "currentLocation", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '时区', example: 'Asia/Tokyo' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], EnhancedContextDto.prototype, "timezone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '语言', enum: ['zh', 'en'], example: 'zh' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], EnhancedContextDto.prototype, "language", void 0);
class TimeSlotDto {
}
exports.TimeSlotDto = TimeSlotDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '开始时间 (HH:mm)', example: '11:30' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TimeSlotDto.prototype, "start", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '结束时间 (HH:mm)', example: '14:00' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TimeSlotDto.prototype, "end", void 0);
class ClarificationParamsDto {
}
exports.ClarificationParamsDto = ClarificationParamsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '目标天数 (1-based)', example: 1 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], ClarificationParamsDto.prototype, "dayNumber", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '时间段' }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => TimeSlotDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", TimeSlotDto)
], ClarificationParamsDto.prototype, "timeSlot", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '目标行程项 ID', example: 'item_xxx' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ClarificationParamsDto.prototype, "targetItemId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '缺口 ID', example: 'gap_meal_1_lunch' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ClarificationParamsDto.prototype, "gapId", void 0);
class ClarificationDataDto {
}
exports.ClarificationDataDto = ClarificationDataDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '选择的动作类型',
        enum: ['QUERY', 'ADD_TO_ITINERARY', 'REPLACE', 'REMOVE', 'MODIFY'],
        example: 'ADD_TO_ITINERARY',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ClarificationDataDto.prototype, "selectedAction", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '目标参数' }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => ClarificationParamsDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", ClarificationParamsDto)
], ClarificationDataDto.prototype, "params", void 0);
class StartTripPlannerSessionDto {
}
exports.StartTripPlannerSessionDto = StartTripPlannerSessionDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '行程ID',
        example: '550e8400-e29b-41d4-a716-446655440000',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], StartTripPlannerSessionDto.prototype, "tripId", void 0);
class TripPlannerChatDto {
}
exports.TripPlannerChatDto = TripPlannerChatDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '行程ID',
        example: '550e8400-e29b-41d4-a716-446655440000',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TripPlannerChatDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '用户消息',
        example: '帮我优化一下行程路线',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TripPlannerChatDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '会话ID（可选，用于继续之前的会话）',
        example: 'planner_xxx_abc123',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], TripPlannerChatDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '目标日期（某些操作需要指定日期）',
        example: 2,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], TripPlannerChatDto.prototype, "targetDay", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '目标项目ID（某些操作需要指定项目）',
        example: 'item_xxx',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], TripPlannerChatDto.prototype, "targetItemId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '增强的上下文信息',
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => EnhancedContextDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", EnhancedContextDto)
], TripPlannerChatDto.prototype, "context", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '澄清选择数据（当用户选择澄清选项时携带）',
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => ClarificationDataDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", ClarificationDataDto)
], TripPlannerChatDto.prototype, "clarificationData", void 0);
class TripPlannerActionDto {
}
exports.TripPlannerActionDto = TripPlannerActionDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '行程ID',
        example: '550e8400-e29b-41d4-a716-446655440000',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TripPlannerActionDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '操作类型',
        example: 'OPTIMIZE_ROUTE',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TripPlannerActionDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '会话ID',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], TripPlannerActionDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '操作参数',
    }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], TripPlannerActionDto.prototype, "params", void 0);
class ConfirmChangesDto {
}
exports.ConfirmChangesDto = ConfirmChangesDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '行程ID',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ConfirmChangesDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '会话ID',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ConfirmChangesDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '要确认的修改ID列表',
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], ConfirmChangesDto.prototype, "changeIds", void 0);
class SuggestionPlaceDto {
}
exports.SuggestionPlaceDto = SuggestionPlaceDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '地点名称', example: '一兰拉面' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SuggestionPlaceDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '中文名称', example: '一兰拉面' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SuggestionPlaceDto.prototype, "nameCN", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '地点ID', example: 12345 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], SuggestionPlaceDto.prototype, "placeId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '类别', example: 'RESTAURANT' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SuggestionPlaceDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '地址', example: '东京都台东区浅草1-2-3' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SuggestionPlaceDto.prototype, "address", void 0);
class ApplySuggestionDto {
}
exports.ApplySuggestionDto = ApplySuggestionDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '行程ID',
        example: '550e8400-e29b-41d4-a716-446655440000',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ApplySuggestionDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '会话ID',
        example: 'planner_xxx_abc123',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ApplySuggestionDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '建议ID',
        example: 'suggestion_ramen_001',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ApplySuggestionDto.prototype, "suggestionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '目标天数 (1-based)',
        example: 1,
    }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ApplySuggestionDto.prototype, "targetDay", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '时间段（可选，未提供则自动安排）',
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => TimeSlotDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", TimeSlotDto)
], ApplySuggestionDto.prototype, "timeSlot", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '建议类型',
        enum: ['add_place', 'modify_time', 'add_meal', 'optimize_route'],
        example: 'add_place',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ApplySuggestionDto.prototype, "suggestionType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '地点信息（add_place 时必填）',
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => SuggestionPlaceDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", SuggestionPlaceDto)
], ApplySuggestionDto.prototype, "place", void 0);
//# sourceMappingURL=trip-planner.dto.js.map