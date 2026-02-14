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
exports.GetCitiesQueryDto = exports.CityDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class CityDto {
}
exports.CityDto = CityDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '城市 ID',
        example: 1,
    }),
    __metadata("design:type", Number)
], CityDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '城市名称',
        example: 'Tokyo',
    }),
    __metadata("design:type", String)
], CityDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '国家代码（ISO 3166-1 alpha-2）',
        example: 'JP',
    }),
    __metadata("design:type", String)
], CityDto.prototype, "countryCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '中文名称',
        example: '东京',
    }),
    __metadata("design:type", String)
], CityDto.prototype, "nameCN", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '英文名称',
        example: 'Tokyo',
    }),
    __metadata("design:type", String)
], CityDto.prototype, "nameEN", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '行政区划代码',
        example: '131000',
    }),
    __metadata("design:type", String)
], CityDto.prototype, "adcode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '时区',
        example: 'Asia/Tokyo',
    }),
    __metadata("design:type", String)
], CityDto.prototype, "timezone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '纬度',
        example: 35.6762,
    }),
    __metadata("design:type", Number)
], CityDto.prototype, "lat", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '经度',
        example: 139.6503,
    }),
    __metadata("design:type", Number)
], CityDto.prototype, "lng", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '扩展元数据',
        example: {},
    }),
    __metadata("design:type", Object)
], CityDto.prototype, "metadata", void 0);
class GetCitiesQueryDto {
}
exports.GetCitiesQueryDto = GetCitiesQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '国家代码（ISO 3166-1 alpha-2）',
        example: 'JP',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetCitiesQueryDto.prototype, "countryCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '搜索关键词（支持中文名、英文名、名称）',
        example: '东京',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetCitiesQueryDto.prototype, "q", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '返回数量限制（最大1000，默认50）',
        example: 50,
        default: 50,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], GetCitiesQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '偏移量（用于分页）',
        example: 0,
        default: 0,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], GetCitiesQueryDto.prototype, "offset", void 0);
//# sourceMappingURL=city.dto.js.map