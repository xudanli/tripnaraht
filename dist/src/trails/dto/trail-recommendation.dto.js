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
exports.RecommendTrailsForPlacesDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class RecommendTrailsForPlacesDto {
}
exports.RecommendTrailsForPlacesDto = RecommendTrailsForPlacesDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '景点ID列表（至少2个）',
        example: [1, 2, 3],
        type: [Number],
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsInt)({ each: true }),
    __metadata("design:type", Array)
], RecommendTrailsForPlacesDto.prototype, "placeIds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '最大距离（公里）',
        example: 20,
        type: Number,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], RecommendTrailsForPlacesDto.prototype, "maxDistance", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '优先推荐非公路步道',
        example: true,
        type: Boolean,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], RecommendTrailsForPlacesDto.prototype, "preferOffRoad", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '最大难度等级（EXTREME, HARD, MODERATE, EASY）',
        example: 'MODERATE',
        type: String,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RecommendTrailsForPlacesDto.prototype, "maxDifficulty", void 0);
//# sourceMappingURL=trail-recommendation.dto.js.map