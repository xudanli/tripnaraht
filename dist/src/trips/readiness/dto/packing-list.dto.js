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
exports.UpdatePackingListItemResponseDto = exports.UpdatePackingListItemDto = exports.GetPackingListResponseDto = exports.GeneratePackingListResponseDto = exports.PackingListSummaryDto = exports.PackingListItemDto = exports.GeneratePackingListDto = exports.CustomPackingItemDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class CustomPackingItemDto {
}
exports.CustomPackingItemDto = CustomPackingItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '物品名称', example: '充电宝' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CustomPackingItemDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '类别',
        enum: ['clothing', 'gear', 'documents', 'electronics', 'food', 'medical', 'other'],
        example: 'electronics',
    }),
    (0, class_validator_1.IsEnum)(['clothing', 'gear', 'documents', 'electronics', 'food', 'medical', 'other']),
    __metadata("design:type", String)
], CustomPackingItemDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '数量', example: 1 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CustomPackingItemDto.prototype, "quantity", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '备注', example: '20000mAh' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CustomPackingItemDto.prototype, "note", void 0);
class GeneratePackingListDto {
}
exports.GeneratePackingListDto = GeneratePackingListDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否包含可选物品（默认 false）',
        example: false,
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], GeneratePackingListDto.prototype, "includeOptional", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '指定类别',
        example: ['clothing', 'gear', 'documents'],
        type: [String],
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], GeneratePackingListDto.prototype, "categories", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '用户自定义物品',
        type: [CustomPackingItemDto],
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], GeneratePackingListDto.prototype, "customItems", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '季节：summer(6-8月), transition(5月/9月), winter(11-3月)',
        enum: ['summer', 'transition', 'winter'],
        example: 'summer',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GeneratePackingListDto.prototype, "season", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '路线类型',
        enum: ['golden_circle', 'south_coast', 'snaefellsnes', 'full_ring_road', 'westfjords', 'highlands', 'custom'],
        example: 'south_coast',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GeneratePackingListDto.prototype, "route", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '用户类型',
        enum: ['first_timer', 'photographer', 'adventurer', 'family_with_kids', 'budget_backpacker', 'cultural_explorer', 'luxury_traveler'],
        example: 'first_timer',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GeneratePackingListDto.prototype, "userType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '计划的活动',
        type: [String],
        example: ['hiking', 'hot_spring'],
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], GeneratePackingListDto.prototype, "activities", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '租车类型',
        enum: ['compact_car', 'sedan', 'suv_2wd', 'suv_4wd', 'campervan'],
        example: 'suv_4wd',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GeneratePackingListDto.prototype, "vehicleType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '特殊需求',
        type: [String],
        example: [],
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], GeneratePackingListDto.prototype, "specialNeeds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否使用模板数据生成（默认 true，如果提供了 season 等参数）',
        example: true,
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], GeneratePackingListDto.prototype, "useTemplate", void 0);
class PackingListItemDto {
}
exports.PackingListItemDto = PackingListItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '物品ID', example: 'item-1' }),
    __metadata("design:type", String)
], PackingListItemDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '物品名称', example: '分层保暖衣物' }),
    __metadata("design:type", String)
], PackingListItemDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '类别',
        enum: ['clothing', 'gear', 'documents', 'electronics', 'food', 'medical', 'other'],
        example: 'clothing',
    }),
    __metadata("design:type", String)
], PackingListItemDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '数量', example: 3 }),
    __metadata("design:type", Number)
], PackingListItemDto.prototype, "quantity", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '单位', example: '套' }),
    __metadata("design:type", String)
], PackingListItemDto.prototype, "unit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '优先级',
        enum: ['must', 'should', 'optional'],
        example: 'must',
    }),
    __metadata("design:type", String)
], PackingListItemDto.prototype, "priority", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '为什么需要这个物品（基于准备度检查结果）',
        example: '冰岛冬季户外温度低，天气多变',
    }),
    __metadata("design:type", String)
], PackingListItemDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '来源的 finding ID（如果有）',
        example: 'must-iceland-winter-clothing',
    }),
    __metadata("design:type", String)
], PackingListItemDto.prototype, "sourceFindingId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否已勾选（用户标记为已打包）', example: false }),
    __metadata("design:type", Boolean)
], PackingListItemDto.prototype, "checked", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '备注', example: '建议准备3套' }),
    __metadata("design:type", String)
], PackingListItemDto.prototype, "note", void 0);
class PackingListSummaryDto {
}
exports.PackingListSummaryDto = PackingListSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总物品数', example: 15 }),
    __metadata("design:type", Number)
], PackingListSummaryDto.prototype, "totalItems", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '按类别统计',
        example: {
            clothing: 5,
            gear: 4,
            documents: 3,
            electronics: 2,
            other: 1,
        },
    }),
    __metadata("design:type", Object)
], PackingListSummaryDto.prototype, "byCategory", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '已勾选物品数', example: 5 }),
    __metadata("design:type", Number)
], PackingListSummaryDto.prototype, "checkedItems", void 0);
class GeneratePackingListResponseDto {
}
exports.GeneratePackingListResponseDto = GeneratePackingListResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程ID', example: '123' }),
    __metadata("design:type", String)
], GeneratePackingListResponseDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '生成时间（ISO 8601 格式）',
        example: '2024-01-15T10:45:00Z',
    }),
    __metadata("design:type", String)
], GeneratePackingListResponseDto.prototype, "generatedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '打包清单项列表',
        type: [PackingListItemDto],
    }),
    __metadata("design:type", Array)
], GeneratePackingListResponseDto.prototype, "items", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '摘要信息',
        type: PackingListSummaryDto,
    }),
    __metadata("design:type", PackingListSummaryDto)
], GeneratePackingListResponseDto.prototype, "summary", void 0);
class GetPackingListResponseDto {
}
exports.GetPackingListResponseDto = GetPackingListResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程ID', example: '123' }),
    __metadata("design:type", String)
], GetPackingListResponseDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '打包清单项列表',
        type: [PackingListItemDto],
    }),
    __metadata("design:type", Array)
], GetPackingListResponseDto.prototype, "items", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '摘要信息',
        type: PackingListSummaryDto,
    }),
    __metadata("design:type", PackingListSummaryDto)
], GetPackingListResponseDto.prototype, "summary", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '最后生成时间（ISO 8601 格式）',
        example: '2024-01-15T10:45:00Z',
    }),
    __metadata("design:type", String)
], GetPackingListResponseDto.prototype, "lastGeneratedAt", void 0);
class UpdatePackingListItemDto {
}
exports.UpdatePackingListItemDto = UpdatePackingListItemDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否已勾选', example: true }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], UpdatePackingListItemDto.prototype, "checked", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '更新数量', example: 2 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], UpdatePackingListItemDto.prototype, "quantity", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '更新备注', example: '已准备' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdatePackingListItemDto.prototype, "note", void 0);
class UpdatePackingListItemResponseDto {
}
exports.UpdatePackingListItemResponseDto = UpdatePackingListItemResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '物品ID', example: 'item-1' }),
    __metadata("design:type", String)
], UpdatePackingListItemResponseDto.prototype, "itemId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否已更新', example: true }),
    __metadata("design:type", Boolean)
], UpdatePackingListItemResponseDto.prototype, "updated", void 0);
//# sourceMappingURL=packing-list.dto.js.map