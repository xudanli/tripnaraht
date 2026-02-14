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
exports.PlaceListAdminResponseDto = exports.PlaceAdminResponseDto = exports.GetPlacesAdminQueryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
class GetPlacesAdminQueryDto {
    constructor() {
        this.page = 1;
        this.limit = 20;
    }
}
exports.GetPlacesAdminQueryDto = GetPlacesAdminQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '页码', example: 1, default: 1 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], GetPlacesAdminQueryDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '每页数量（最大100）', example: 20, default: 20, maximum: 100 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], GetPlacesAdminQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '搜索关键词（名称、地址）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetPlacesAdminQueryDto.prototype, "search", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '地点类别',
        enum: client_1.PlaceCategory,
        example: 'ATTRACTION'
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.PlaceCategory),
    __metadata("design:type", String)
], GetPlacesAdminQueryDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '城市ID', example: 1 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], GetPlacesAdminQueryDto.prototype, "cityId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '国家代码（ISO 3166-1 alpha-2）', example: 'JP' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetPlacesAdminQueryDto.prototype, "countryCode", void 0);
class PlaceAdminResponseDto {
}
exports.PlaceAdminResponseDto = PlaceAdminResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '地点ID' }),
    __metadata("design:type", Number)
], PlaceAdminResponseDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'UUID' }),
    __metadata("design:type", String)
], PlaceAdminResponseDto.prototype, "uuid", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '中文名称' }),
    __metadata("design:type", String)
], PlaceAdminResponseDto.prototype, "nameCN", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '英文名称' }),
    __metadata("design:type", String)
], PlaceAdminResponseDto.prototype, "nameEN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '地点类别', enum: client_1.PlaceCategory }),
    __metadata("design:type", String)
], PlaceAdminResponseDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '地址' }),
    __metadata("design:type", String)
], PlaceAdminResponseDto.prototype, "address", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '评分' }),
    __metadata("design:type", Number)
], PlaceAdminResponseDto.prototype, "rating", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Google Place ID' }),
    __metadata("design:type", String)
], PlaceAdminResponseDto.prototype, "googlePlaceId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '位置坐标', type: Object }),
    __metadata("design:type", Object)
], PlaceAdminResponseDto.prototype, "location", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '元数据', type: Object }),
    __metadata("design:type", Object)
], PlaceAdminResponseDto.prototype, "metadata", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '物理元数据', type: Object }),
    __metadata("design:type", Object)
], PlaceAdminResponseDto.prototype, "physicalMetadata", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '城市信息', type: Object }),
    __metadata("design:type", Object)
], PlaceAdminResponseDto.prototype, "city", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '国家代码（ISO 3166-1 alpha-2）', example: 'JP' }),
    __metadata("design:type", String)
], PlaceAdminResponseDto.prototype, "countryCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '地点介绍' }),
    __metadata("design:type", String)
], PlaceAdminResponseDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '创建时间' }),
    __metadata("design:type", Date)
], PlaceAdminResponseDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '更新时间' }),
    __metadata("design:type", Date)
], PlaceAdminResponseDto.prototype, "updatedAt", void 0);
class PlaceListAdminResponseDto {
}
exports.PlaceListAdminResponseDto = PlaceListAdminResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '地点列表', type: [PlaceAdminResponseDto] }),
    __metadata("design:type", Array)
], PlaceListAdminResponseDto.prototype, "places", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总数' }),
    __metadata("design:type", Number)
], PlaceListAdminResponseDto.prototype, "total", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '页码' }),
    __metadata("design:type", Number)
], PlaceListAdminResponseDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '每页数量' }),
    __metadata("design:type", Number)
], PlaceListAdminResponseDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总页数' }),
    __metadata("design:type", Number)
], PlaceListAdminResponseDto.prototype, "totalPages", void 0);
//# sourceMappingURL=admin-place.dto.js.map