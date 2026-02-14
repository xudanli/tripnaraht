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
exports.RefineTripRequestDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class RefineTripRequestDto {
}
exports.RefineTripRequestDto = RefineTripRequestDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '会话ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RefineTripRequestDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RefineTripRequestDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '要细化的天数（1-based）', type: [Number] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], RefineTripRequestDto.prototype, "days", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '包含餐厅', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], RefineTripRequestDto.prototype, "includeRestaurants", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '包含交通', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], RefineTripRequestDto.prototype, "includeTransport", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '包含活动', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], RefineTripRequestDto.prototype, "includeActivities", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '语言', enum: ['en', 'zh'], default: 'zh' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['en', 'zh']),
    __metadata("design:type", String)
], RefineTripRequestDto.prototype, "language", void 0);
//# sourceMappingURL=refine-trip-request.dto.js.map