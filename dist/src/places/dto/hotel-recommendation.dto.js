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
exports.HotelRecommendationDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const hotel_strategy_interface_1 = require("../interfaces/hotel-strategy.interface");
class HotelRecommendationDto {
}
exports.HotelRecommendationDto = HotelRecommendationDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '行程 ID（用于获取景点列表）',
        example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], HotelRecommendationDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '景点 ID 列表（如果直接提供，将忽略 tripId）',
        type: [Number],
        example: [1, 2, 3],
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsNumber)({}, { each: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], HotelRecommendationDto.prototype, "attractionIds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '推荐策略（如果未指定，将根据行程密度自动选择）',
        enum: hotel_strategy_interface_1.HotelRecommendationStrategy,
        example: hotel_strategy_interface_1.HotelRecommendationStrategy.HUB,
    }),
    (0, class_validator_1.IsEnum)(hotel_strategy_interface_1.HotelRecommendationStrategy),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], HotelRecommendationDto.prototype, "strategy", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '预算上限（每晚，元）',
        example: 2000,
        minimum: 0,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], HotelRecommendationDto.prototype, "maxBudget", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '最低星级要求',
        example: 3,
        minimum: 1,
        maximum: 5,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], HotelRecommendationDto.prototype, "minTier", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '最高星级要求',
        example: 3,
        minimum: 1,
        maximum: 5,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], HotelRecommendationDto.prototype, "maxTier", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '时间价值（元/小时）。如果未指定且提供了 tripId，系统会根据预算、行程密度、旅行者类型自动计算',
        example: 50,
        minimum: 0,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], HotelRecommendationDto.prototype, "timeValuePerHour", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否考虑隐形成本（交通费 + 时间成本）',
        example: true,
        default: true,
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], HotelRecommendationDto.prototype, "includeHiddenCost", void 0);
//# sourceMappingURL=hotel-recommendation.dto.js.map