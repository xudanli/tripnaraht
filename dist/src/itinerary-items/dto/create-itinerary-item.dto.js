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
exports.CreateItineraryItemDto = exports.ItemType = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const validation_interface_1 = require("../interfaces/validation.interface");
const item_cost_dto_1 = require("./item-cost.dto");
var ItemType;
(function (ItemType) {
    ItemType["ACTIVITY"] = "ACTIVITY";
    ItemType["REST"] = "REST";
    ItemType["MEAL_ANCHOR"] = "MEAL_ANCHOR";
    ItemType["MEAL_FLOATING"] = "MEAL_FLOATING";
    ItemType["TRANSIT"] = "TRANSIT";
})(ItemType || (exports.ItemType = ItemType = {}));
class CreateItineraryItemDto {
}
exports.CreateItineraryItemDto = CreateItineraryItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '行程日期 ID（关联到 TripDay）',
        example: 'd0f6ab6c-0e94-491b-954c-bb0355e797cf'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'tripDayId 不能为空' }),
    __metadata("design:type", String)
], CreateItineraryItemDto.prototype, "tripDayId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '地点 ID（关联到 Place）。如果是 TRANSIT 或 REST 可能为空',
        example: 1,
        type: Number
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateItineraryItemDto.prototype, "placeId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '徒步路线 ID（关联到 Trail）。当type为ACTIVITY且是徒步活动时使用',
        example: 1,
        type: Number
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateItineraryItemDto.prototype, "trailId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '行程项类型',
        enum: ItemType,
        example: ItemType.ACTIVITY
    }),
    (0, class_validator_1.IsEnum)(ItemType, { message: 'type 必须是有效的 ItemType 枚举值' }),
    __metadata("design:type", String)
], CreateItineraryItemDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '开始时间（ISO 8601 格式）',
        example: '2024-05-01T10:00:00.000Z',
        type: String,
        format: 'date-time'
    }),
    (0, class_validator_1.IsDateString)({}, { message: 'startTime 必须是有效的日期时间字符串 (ISO 8601)' }),
    __metadata("design:type", String)
], CreateItineraryItemDto.prototype, "startTime", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '结束时间（ISO 8601 格式）',
        example: '2024-05-01T12:00:00.000Z',
        type: String,
        format: 'date-time'
    }),
    (0, class_validator_1.IsDateString)({}, { message: 'endTime 必须是有效的日期时间字符串 (ISO 8601)' }),
    __metadata("design:type", String)
], CreateItineraryItemDto.prototype, "endTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '备注信息（如：记得带充电宝、需要提前预约等）',
        example: '记得穿和服拍照',
        type: String
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateItineraryItemDto.prototype, "note", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '显示顺序（数字越小越靠前，用于控制行程项的显示顺序。如果不提供，将自动计算）',
        example: 1,
        type: Number,
        minimum: 0
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateItineraryItemDto.prototype, "order", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '预估费用',
        example: 150,
        minimum: 0
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateItineraryItemDto.prototype, "estimatedCost", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '实际费用',
        example: 165,
        minimum: 0
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateItineraryItemDto.prototype, "actualCost", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '货币类型',
        example: 'CNY',
        default: 'CNY'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateItineraryItemDto.prototype, "currency", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '费用分类',
        enum: item_cost_dto_1.CostCategory,
        example: item_cost_dto_1.CostCategory.ACTIVITIES
    }),
    (0, class_validator_1.IsEnum)(item_cost_dto_1.CostCategory),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateItineraryItemDto.prototype, "costCategory", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '费用备注',
        example: '门票+缆车'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateItineraryItemDto.prototype, "costNote", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否已支付',
        default: false
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateItineraryItemDto.prototype, "isPaid", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '支付人ID'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateItineraryItemDto.prototype, "paidBy", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '强制创建，忽略 WARNING 级别校验。设置为 true 时，即使存在交通时间不足等警告也会创建成功',
        example: false,
        default: false
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateItineraryItemDto.prototype, "forceCreate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '忽略的警告类型列表。只有列出的警告类型会被忽略，其他警告仍需确认',
        enum: validation_interface_1.ValidationCode,
        isArray: true,
        example: ['INSUFFICIENT_TRAVEL_TIME', 'SHORT_BUFFER']
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], CreateItineraryItemDto.prototype, "ignoreWarnings", void 0);
//# sourceMappingURL=create-itinerary-item.dto.js.map