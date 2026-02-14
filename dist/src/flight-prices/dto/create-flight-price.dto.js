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
exports.CreateFlightPriceDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class CreateFlightPriceDto {
}
exports.CreateFlightPriceDto = CreateFlightPriceDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '目的地国家代码（ISO 3166-1 alpha-2）',
        example: 'JP',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateFlightPriceDto.prototype, "countryCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '出发城市代码（可选），如 "PEK"（北京）、"PVG"（上海）。如果为空则表示任意出发城市',
        example: 'PEK',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateFlightPriceDto.prototype, "originCity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '淡季价格（人民币，元）',
        example: 2500,
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateFlightPriceDto.prototype, "lowSeasonPrice", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '旺季价格（人民币，元）',
        example: 6000,
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateFlightPriceDto.prototype, "highSeasonPrice", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '签证费用（人民币，元），0 表示免签或落地签',
        example: 0,
        default: 0,
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateFlightPriceDto.prototype, "visaCost", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '数据来源说明',
        example: '手动估算',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateFlightPriceDto.prototype, "source", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '备注信息',
        example: '价格包含税费，不含行李费',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateFlightPriceDto.prototype, "notes", void 0);
//# sourceMappingURL=create-flight-price.dto.js.map