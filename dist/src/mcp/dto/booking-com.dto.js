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
exports.SearchCarRentalsDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class SearchCarRentalsDto {
}
exports.SearchCarRentalsDto = SearchCarRentalsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '取车地点纬度', example: 40.6397 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SearchCarRentalsDto.prototype, "pick_up_latitude", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '取车地点经度', example: -73.7792 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SearchCarRentalsDto.prototype, "pick_up_longitude", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '还车地点纬度', example: 40.6397 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SearchCarRentalsDto.prototype, "drop_off_latitude", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '还车地点经度', example: -73.7792 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SearchCarRentalsDto.prototype, "drop_off_longitude", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '取车时间 (HH:mm)', example: '10:00' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, { message: 'pick_up_time must be in HH:mm format' }),
    __metadata("design:type", String)
], SearchCarRentalsDto.prototype, "pick_up_time", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '还车时间 (HH:mm)', example: '10:00' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, { message: 'drop_off_time must be in HH:mm format' }),
    __metadata("design:type", String)
], SearchCarRentalsDto.prototype, "drop_off_time", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '司机年龄', example: 30 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SearchCarRentalsDto.prototype, "driver_age", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '货币代码', example: 'USD', default: 'USD' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchCarRentalsDto.prototype, "currency_code", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '位置代码', example: 'US', default: 'US' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchCarRentalsDto.prototype, "location", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '取车日期 (YYYY-MM-DD)', example: '2026-06-01' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], SearchCarRentalsDto.prototype, "pick_up_date", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '还车日期 (YYYY-MM-DD)', example: '2026-06-05' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], SearchCarRentalsDto.prototype, "drop_off_date", void 0);
//# sourceMappingURL=booking-com.dto.js.map