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
exports.NearbyPoiResultDto = exports.SearchNearbyPoiQueryDto = exports.NearbyPoiCategory = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
var NearbyPoiCategory;
(function (NearbyPoiCategory) {
    NearbyPoiCategory["ATTRACTION"] = "ATTRACTION";
    NearbyPoiCategory["RESTAURANT"] = "RESTAURANT";
    NearbyPoiCategory["HOTEL"] = "HOTEL";
    NearbyPoiCategory["GAS_STATION"] = "GAS_STATION";
    NearbyPoiCategory["REST_AREA"] = "REST_AREA";
})(NearbyPoiCategory || (exports.NearbyPoiCategory = NearbyPoiCategory = {}));
class SearchNearbyPoiQueryDto {
}
exports.SearchNearbyPoiQueryDto = SearchNearbyPoiQueryDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '行程项ID（可选，如果提供则使用行程项的坐标）',
        example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchNearbyPoiQueryDto.prototype, "itemId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '纬度（如果未提供 itemId，则必须提供）',
        example: 64.2556,
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(-90),
    (0, class_validator_1.Max)(90),
    __metadata("design:type", Number)
], SearchNearbyPoiQueryDto.prototype, "lat", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '经度（如果未提供 itemId，则必须提供）',
        example: -21.1294,
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(-180),
    (0, class_validator_1.Max)(180),
    __metadata("design:type", Number)
], SearchNearbyPoiQueryDto.prototype, "lng", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '搜索半径（米），默认5000米',
        example: 5000,
        required: false,
        default: 5000,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(100),
    (0, class_validator_1.Max)(50000),
    __metadata("design:type", Number)
], SearchNearbyPoiQueryDto.prototype, "radius", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '要搜索的POI类别（可多选）',
        enum: NearbyPoiCategory,
        isArray: true,
        example: [NearbyPoiCategory.ATTRACTION, NearbyPoiCategory.RESTAURANT],
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsEnum)(NearbyPoiCategory, { each: true }),
    __metadata("design:type", Array)
], SearchNearbyPoiQueryDto.prototype, "categories", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '最小评分（0-5）',
        example: 4.0,
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(5),
    __metadata("design:type", Number)
], SearchNearbyPoiQueryDto.prototype, "minRating", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '是否只返回当前营业的地点（仅对餐厅有效）',
        example: true,
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], SearchNearbyPoiQueryDto.prototype, "openNow", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '返回结果数量限制',
        example: 20,
        required: false,
        default: 20,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(50),
    __metadata("design:type", Number)
], SearchNearbyPoiQueryDto.prototype, "limit", void 0);
class NearbyPoiResultDto {
}
exports.NearbyPoiResultDto = NearbyPoiResultDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '地点ID' }),
    __metadata("design:type", Number)
], NearbyPoiResultDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '中文名称' }),
    __metadata("design:type", String)
], NearbyPoiResultDto.prototype, "nameCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '英文名称', required: false }),
    __metadata("design:type", String)
], NearbyPoiResultDto.prototype, "nameEN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '类别', enum: client_1.PlaceCategory }),
    __metadata("design:type", String)
], NearbyPoiResultDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '地址', required: false }),
    __metadata("design:type", String)
], NearbyPoiResultDto.prototype, "address", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '评分', required: false }),
    __metadata("design:type", Number)
], NearbyPoiResultDto.prototype, "rating", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '纬度' }),
    __metadata("design:type", Number)
], NearbyPoiResultDto.prototype, "lat", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '经度' }),
    __metadata("design:type", Number)
], NearbyPoiResultDto.prototype, "lng", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '距离（米）' }),
    __metadata("design:type", Number)
], NearbyPoiResultDto.prototype, "distanceMeters", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '营业时间信息', required: false }),
    __metadata("design:type", Object)
], NearbyPoiResultDto.prototype, "openingHours", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '其他元数据', required: false }),
    __metadata("design:type", Object)
], NearbyPoiResultDto.prototype, "metadata", void 0);
//# sourceMappingURL=search-nearby-poi.dto.js.map