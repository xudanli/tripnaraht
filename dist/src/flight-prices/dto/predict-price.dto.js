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
exports.FlightPricePredictionDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class FlightPricePredictionDto {
}
exports.FlightPricePredictionDto = FlightPricePredictionDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '出发城市',
        example: '北京',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FlightPricePredictionDto.prototype, "from_city", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '目的地城市',
        example: '上海',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FlightPricePredictionDto.prototype, "to_city", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '出发日期 (ISO 8601 date)',
        example: '2024-05-01',
    }),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], FlightPricePredictionDto.prototype, "departure_date", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '返程日期 (ISO 8601 date, 可选)',
        example: '2024-05-05',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], FlightPricePredictionDto.prototype, "return_date", void 0);
//# sourceMappingURL=predict-price.dto.js.map