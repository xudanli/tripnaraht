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
exports.RegenerateTripResponseDto = exports.RegenerateChangeItem = exports.RegenerateTripDto = exports.ReplaceItineraryItemResponseDto = exports.ReplaceItineraryItemDto = exports.SaveTripDraftDto = exports.TripDraftResponseDto = exports.TripDraftMetadata = exports.DraftDay = exports.DraftDaySlots = exports.DraftItineraryItem = exports.DraftItineraryItemEvidence = exports.CreateTripDraftDto = exports.TripConstraintsDto = exports.TimeSlot = exports.HikingLevel = exports.AccommodationBase = exports.TransportMode = exports.IntensityLevel = exports.TravelStyle = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const swagger_1 = require("@nestjs/swagger");
var TravelStyle;
(function (TravelStyle) {
    TravelStyle["NATURE"] = "nature";
    TravelStyle["CULTURE"] = "culture";
    TravelStyle["FOOD"] = "food";
    TravelStyle["CITYWALK"] = "citywalk";
    TravelStyle["PHOTOGRAPHY"] = "photography";
    TravelStyle["ADVENTURE"] = "adventure";
})(TravelStyle || (exports.TravelStyle = TravelStyle = {}));
var IntensityLevel;
(function (IntensityLevel) {
    IntensityLevel["RELAXED"] = "relaxed";
    IntensityLevel["BALANCED"] = "balanced";
    IntensityLevel["INTENSE"] = "intense";
})(IntensityLevel || (exports.IntensityLevel = IntensityLevel = {}));
var TransportMode;
(function (TransportMode) {
    TransportMode["WALK"] = "walk";
    TransportMode["TRANSIT"] = "transit";
    TransportMode["CAR"] = "car";
})(TransportMode || (exports.TransportMode = TransportMode = {}));
var AccommodationBase;
(function (AccommodationBase) {
    AccommodationBase["FIXED"] = "fixed";
    AccommodationBase["MOVING"] = "moving";
})(AccommodationBase || (exports.AccommodationBase = AccommodationBase = {}));
var HikingLevel;
(function (HikingLevel) {
    HikingLevel["NONE"] = "none";
    HikingLevel["LIGHT"] = "light";
    HikingLevel["HIKING_HEAVY"] = "hiking-heavy";
})(HikingLevel || (exports.HikingLevel = HikingLevel = {}));
var TimeSlot;
(function (TimeSlot) {
    TimeSlot["MORNING"] = "morning";
    TimeSlot["LUNCH"] = "lunch";
    TimeSlot["AFTERNOON"] = "afternoon";
    TimeSlot["DINNER"] = "dinner";
    TimeSlot["EVENING"] = "evening";
})(TimeSlot || (exports.TimeSlot = TimeSlot = {}));
class TripConstraintsDto {
}
exports.TripConstraintsDto = TripConstraintsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否有儿童' }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], TripConstraintsDto.prototype, "withChildren", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否有老人' }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], TripConstraintsDto.prototype, "withElderly", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否早起' }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], TripConstraintsDto.prototype, "earlyRiser", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '饮食限制', type: [String] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], TripConstraintsDto.prototype, "dietaryRestrictions", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '避免的类别', type: [String] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], TripConstraintsDto.prototype, "avoidCategories", void 0);
class CreateTripDraftDto {
}
exports.CreateTripDraftDto = CreateTripDraftDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '目的地国家代码（ISO 3166-1 alpha-2）', example: 'JP' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateTripDraftDto.prototype, "destination", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程天数（1-14）', example: 3, minimum: 1, maximum: 14 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreateTripDraftDto.prototype, "days", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: TravelStyle, description: '旅行风格' }),
    (0, class_validator_1.IsEnum)(TravelStyle),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTripDraftDto.prototype, "style", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: IntensityLevel, description: '强度等级' }),
    (0, class_validator_1.IsEnum)(IntensityLevel),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTripDraftDto.prototype, "intensity", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: TransportMode, description: '交通方式' }),
    (0, class_validator_1.IsEnum)(TransportMode),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTripDraftDto.prototype, "transport", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: AccommodationBase, description: '住宿类型' }),
    (0, class_validator_1.IsEnum)(AccommodationBase),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTripDraftDto.prototype, "accommodationBase", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: HikingLevel, description: '徒步等级' }),
    (0, class_validator_1.IsEnum)(HikingLevel),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTripDraftDto.prototype, "hikingLevel", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: TripConstraintsDto, description: '约束条件' }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => TripConstraintsDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", TripConstraintsDto)
], CreateTripDraftDto.prototype, "constraints", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '开始日期（ISO 8601）', example: '2024-06-01' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTripDraftDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '结束日期（ISO 8601）', example: '2024-06-03' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTripDraftDto.prototype, "endDate", void 0);
class DraftItineraryItemEvidence {
}
exports.DraftItineraryItemEvidence = DraftItineraryItemEvidence;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '营业时间', example: '09:00-18:00' }),
    __metadata("design:type", String)
], DraftItineraryItemEvidence.prototype, "openingHours", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '距离（米）' }),
    __metadata("design:type", Number)
], DraftItineraryItemEvidence.prototype, "distance", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '评分' }),
    __metadata("design:type", Number)
], DraftItineraryItemEvidence.prototype, "rating", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '数据来源' }),
    __metadata("design:type", String)
], DraftItineraryItemEvidence.prototype, "source", void 0);
class DraftItineraryItem {
}
exports.DraftItineraryItem = DraftItineraryItem;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '地点 ID' }),
    __metadata("design:type", Number)
], DraftItineraryItem.prototype, "placeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: TimeSlot, description: '时段' }),
    __metadata("design:type", String)
], DraftItineraryItem.prototype, "slot", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '开始时间（ISO 8601）' }),
    __metadata("design:type", String)
], DraftItineraryItem.prototype, "startTime", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '结束时间（ISO 8601）' }),
    __metadata("design:type", String)
], DraftItineraryItem.prototype, "endTime", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '选择原因' }),
    __metadata("design:type", String)
], DraftItineraryItem.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '备选地点 ID 列表', type: [Number] }),
    __metadata("design:type", Array)
], DraftItineraryItem.prototype, "alternatives", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: DraftItineraryItemEvidence, description: '证据信息' }),
    __metadata("design:type", DraftItineraryItemEvidence)
], DraftItineraryItem.prototype, "evidence", void 0);
class DraftDaySlots {
}
exports.DraftDaySlots = DraftDaySlots;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: DraftItineraryItem, description: '上午时段（9:00-12:00）' }),
    __metadata("design:type", DraftItineraryItem)
], DraftDaySlots.prototype, "morning", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: DraftItineraryItem, description: '午餐时段（12:00-13:30）' }),
    __metadata("design:type", DraftItineraryItem)
], DraftDaySlots.prototype, "lunch", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: DraftItineraryItem, description: '下午时段（13:30-17:30）' }),
    __metadata("design:type", DraftItineraryItem)
], DraftDaySlots.prototype, "afternoon", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: DraftItineraryItem, description: '晚餐时段（18:00-20:00）' }),
    __metadata("design:type", DraftItineraryItem)
], DraftDaySlots.prototype, "dinner", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: DraftItineraryItem, description: '晚上时段（可选）' }),
    __metadata("design:type", DraftItineraryItem)
], DraftDaySlots.prototype, "evening", void 0);
class DraftDay {
}
exports.DraftDay = DraftDay;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '第几天（1, 2, 3...）' }),
    __metadata("design:type", Number)
], DraftDay.prototype, "day", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '日期（YYYY-MM-DD）' }),
    __metadata("design:type", String)
], DraftDay.prototype, "date", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: DraftDaySlots, description: '时段安排' }),
    __metadata("design:type", DraftDaySlots)
], DraftDay.prototype, "slots", void 0);
class TripDraftMetadata {
}
exports.TripDraftMetadata = TripDraftMetadata;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '生成耗时（毫秒）' }),
    __metadata("design:type", Number)
], TripDraftMetadata.prototype, "generationTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'LLM 提供商' }),
    __metadata("design:type", String)
], TripDraftMetadata.prototype, "llmProvider", void 0);
class TripDraftResponseDto {
}
exports.TripDraftResponseDto = TripDraftResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '目的地国家代码' }),
    __metadata("design:type", String)
], TripDraftResponseDto.prototype, "destination", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程天数' }),
    __metadata("design:type", Number)
], TripDraftResponseDto.prototype, "days", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '开始日期（YYYY-MM-DD）' }),
    __metadata("design:type", String)
], TripDraftResponseDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '结束日期（YYYY-MM-DD）' }),
    __metadata("design:type", String)
], TripDraftResponseDto.prototype, "endDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [DraftDay], description: '每天的行程安排' }),
    __metadata("design:type", Array)
], TripDraftResponseDto.prototype, "draftDays", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '候选地点总数' }),
    __metadata("design:type", Number)
], TripDraftResponseDto.prototype, "candidatesCount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '校验警告', type: [String] }),
    __metadata("design:type", Array)
], TripDraftResponseDto.prototype, "validationWarnings", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: TripDraftMetadata, description: '元数据' }),
    __metadata("design:type", TripDraftMetadata)
], TripDraftResponseDto.prototype, "metadata", void 0);
class SaveTripDraftDto {
}
exports.SaveTripDraftDto = SaveTripDraftDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: TripDraftResponseDto, description: '行程草案（来自 /trips/draft 的响应）' }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => TripDraftResponseDto),
    __metadata("design:type", TripDraftResponseDto)
], SaveTripDraftDto.prototype, "draft", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '用户编辑（锁定项、移除项、新增项）' }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], SaveTripDraftDto.prototype, "userEdits", void 0);
class ReplaceItineraryItemDto {
}
exports.ReplaceItineraryItemDto = ReplaceItineraryItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ['too_tired', 'weather_change', 'change_style', 'too_far', 'closed', 'other'],
        description: '替换原因'
    }),
    (0, class_validator_1.IsEnum)(['too_tired', 'weather_change', 'change_style', 'too_far', 'closed', 'other']),
    __metadata("design:type", String)
], ReplaceItineraryItemDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: TravelStyle, description: '偏好的风格' }),
    (0, class_validator_1.IsEnum)(TravelStyle),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ReplaceItineraryItemDto.prototype, "preferredStyle", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '约束条件' }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], ReplaceItineraryItemDto.prototype, "constraints", void 0);
class ReplaceItineraryItemResponseDto {
}
exports.ReplaceItineraryItemResponseDto = ReplaceItineraryItemResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: DraftItineraryItem, description: '新的行程项' }),
    __metadata("design:type", DraftItineraryItem)
], ReplaceItineraryItemResponseDto.prototype, "newItem", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '备选方案列表' }),
    __metadata("design:type", Array)
], ReplaceItineraryItemResponseDto.prototype, "alternatives", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '被替换的项' }),
    __metadata("design:type", Object)
], ReplaceItineraryItemResponseDto.prototype, "replacedItem", void 0);
class RegenerateTripDto {
}
exports.RegenerateTripDto = RegenerateTripDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '锁定的行程项 ID 列表', type: [String] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], RegenerateTripDto.prototype, "lockedItemIds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '新的偏好设置' }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], RegenerateTripDto.prototype, "newPreferences", void 0);
class RegenerateChangeItem {
}
exports.RegenerateChangeItem = RegenerateChangeItem;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['added', 'removed', 'replaced', 'moved'], description: '变更类型' }),
    __metadata("design:type", String)
], RegenerateChangeItem.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '行程项 ID' }),
    __metadata("design:type", String)
], RegenerateChangeItem.prototype, "itemId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '地点 ID' }),
    __metadata("design:type", Number)
], RegenerateChangeItem.prototype, "placeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '地点名称' }),
    __metadata("design:type", String)
], RegenerateChangeItem.prototype, "placeName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '第几天' }),
    __metadata("design:type", Number)
], RegenerateChangeItem.prototype, "day", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: TimeSlot, description: '时段' }),
    __metadata("design:type", String)
], RegenerateChangeItem.prototype, "slot", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '变更原因' }),
    __metadata("design:type", String)
], RegenerateChangeItem.prototype, "reason", void 0);
class RegenerateTripResponseDto {
}
exports.RegenerateTripResponseDto = RegenerateTripResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: TripDraftResponseDto, description: '更新后的草案' }),
    __metadata("design:type", TripDraftResponseDto)
], RegenerateTripResponseDto.prototype, "updatedDraft", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [RegenerateChangeItem], description: '变更列表' }),
    __metadata("design:type", Array)
], RegenerateTripResponseDto.prototype, "changes", void 0);
//# sourceMappingURL=trip-draft.dto.js.map