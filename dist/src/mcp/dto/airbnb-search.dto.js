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
exports.AirbnbListingDetailsDto = exports.AirbnbSearchDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class AirbnbSearchDto {
}
exports.AirbnbSearchDto = AirbnbSearchDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '搜索位置，例如 "Reykjavik, Iceland"',
        example: 'Reykjavik, Iceland',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AirbnbSearchDto.prototype, "location", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '成人数',
        example: 2,
        default: 1,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], AirbnbSearchDto.prototype, "adults", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '儿童数',
        example: 0,
        default: 0,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], AirbnbSearchDto.prototype, "children", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '婴儿数',
        example: 0,
        default: 0,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], AirbnbSearchDto.prototype, "infants", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '宠物数',
        example: 0,
        default: 0,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], AirbnbSearchDto.prototype, "pets", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '入住日期，格式 YYYY-MM-DD',
        example: '2026-02-07',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AirbnbSearchDto.prototype, "checkin", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '退房日期，格式 YYYY-MM-DD',
        example: '2026-02-12',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AirbnbSearchDto.prototype, "checkout", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '页码',
        example: 1,
        default: 1,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], AirbnbSearchDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否忽略 robots.txt（仅用于测试）',
        example: false,
        default: false,
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], AirbnbSearchDto.prototype, "ignoreRobotsText", void 0);
class AirbnbListingDetailsDto {
}
exports.AirbnbListingDetailsDto = AirbnbListingDetailsDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '房源 ID',
        example: '1573970428683000922',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AirbnbListingDetailsDto.prototype, "listingId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '入住日期，格式 YYYY-MM-DD',
        example: '2026-02-07',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AirbnbListingDetailsDto.prototype, "checkin", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '退房日期，格式 YYYY-MM-DD',
        example: '2026-02-12',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AirbnbListingDetailsDto.prototype, "checkout", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '成人数',
        example: 2,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], AirbnbListingDetailsDto.prototype, "adults", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '儿童数',
        example: 0,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], AirbnbListingDetailsDto.prototype, "children", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '婴儿数',
        example: 0,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], AirbnbListingDetailsDto.prototype, "infants", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '宠物数',
        example: 0,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], AirbnbListingDetailsDto.prototype, "pets", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否忽略 robots.txt（仅用于测试）',
        example: false,
        default: false,
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], AirbnbListingDetailsDto.prototype, "ignoreRobotsText", void 0);
//# sourceMappingURL=airbnb-search.dto.js.map