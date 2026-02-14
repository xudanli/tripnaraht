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
exports.AmadeusSearchFlightOffersDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class AmadeusSearchFlightOffersDto {
}
exports.AmadeusSearchFlightOffersDto = AmadeusSearchFlightOffersDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '出发地 IATA 代码（例如：SYD 表示悉尼）',
        example: 'SYD',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AmadeusSearchFlightOffersDto.prototype, "originLocationCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '目的地 IATA 代码（例如：BKK 表示曼谷）',
        example: 'BKK',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AmadeusSearchFlightOffersDto.prototype, "destinationLocationCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '出发日期（ISO 8601 格式：YYYY-MM-DD）',
        example: '2026-05-02',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AmadeusSearchFlightOffersDto.prototype, "departureDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '成人数（12岁以上，1-9）',
        example: 1,
        minimum: 1,
        maximum: 9,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(9),
    __metadata("design:type", Number)
], AmadeusSearchFlightOffersDto.prototype, "adults", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '返程日期（ISO 8601 格式：YYYY-MM-DD，往返航班）',
        example: '2026-05-10',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AmadeusSearchFlightOffersDto.prototype, "returnDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '儿童数（2-11岁）',
        example: 0,
        minimum: 0,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], AmadeusSearchFlightOffersDto.prototype, "children", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '婴儿数（2岁以下）',
        example: 0,
        minimum: 0,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], AmadeusSearchFlightOffersDto.prototype, "infants", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '舱位等级（ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST）',
        example: 'ECONOMY',
        enum: ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'],
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AmadeusSearchFlightOffersDto.prototype, "travelClass", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '包含的航空公司代码（逗号分隔，例如：6X,7X）',
        example: '6X,7X',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AmadeusSearchFlightOffersDto.prototype, "includedAirlineCodes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '排除的航空公司代码（逗号分隔，例如：6X,7X）',
        example: '6X,7X',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AmadeusSearchFlightOffersDto.prototype, "excludedAirlineCodes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否仅返回直飞航班',
        example: false,
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], AmadeusSearchFlightOffersDto.prototype, "nonStop", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '货币代码（ISO 4217，例如：EUR 表示欧元）',
        example: 'EUR',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AmadeusSearchFlightOffersDto.prototype, "currencyCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '每人最高价格（正整数，无小数）',
        example: 1000,
        minimum: 1,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], AmadeusSearchFlightOffersDto.prototype, "maxPrice", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '返回的最大航班数量',
        example: 10,
        minimum: 1,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], AmadeusSearchFlightOffersDto.prototype, "max", void 0);
//# sourceMappingURL=amadeus-search.dto.js.map