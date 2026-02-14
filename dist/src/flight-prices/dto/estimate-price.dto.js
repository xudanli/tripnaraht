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
exports.EstimatePriceResponseDto = exports.EstimatePriceDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class EstimatePriceDto {
}
exports.EstimatePriceDto = EstimatePriceDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '目的地国家代码（ISO 3166-1 alpha-2）',
        example: 'JP',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], EstimatePriceDto.prototype, "countryCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '出发城市代码（可选），如 "PEK"（北京）、"PVG"（上海）',
        example: 'PEK',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], EstimatePriceDto.prototype, "originCity", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否使用保守估算（旺季价格），默认 true',
        example: true,
        default: true,
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], EstimatePriceDto.prototype, "useConservative", void 0);
class EstimatePriceResponseDto {
}
exports.EstimatePriceResponseDto = EstimatePriceResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '估算总成本（机票 + 签证，单位：元）', example: 6000 }),
    __metadata("design:type", Number)
], EstimatePriceResponseDto.prototype, "totalCost", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '机票价格（单位：元）', example: 6000 }),
    __metadata("design:type", Number)
], EstimatePriceResponseDto.prototype, "flightPrice", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '签证费用（单位：元）', example: 0 }),
    __metadata("design:type", Number)
], EstimatePriceResponseDto.prototype, "visaCost", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否使用保守估算', example: true }),
    __metadata("design:type", Boolean)
], EstimatePriceResponseDto.prototype, "useConservative", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '目的地国家代码', example: 'JP' }),
    __metadata("design:type", String)
], EstimatePriceResponseDto.prototype, "countryCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '出发城市代码', example: 'PEK' }),
    __metadata("design:type", String)
], EstimatePriceResponseDto.prototype, "originCity", void 0);
//# sourceMappingURL=estimate-price.dto.js.map