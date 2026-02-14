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
exports.ReEvaluateAfterApplyDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class ReEvaluateAfterApplyDto {
}
exports.ReEvaluateAfterApplyDto = ReEvaluateAfterApplyDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '规划策略（JSON 对象）', type: Object }),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], ReEvaluateAfterApplyDto.prototype, "policy", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '已应用的行程计划（DayScheduleResult）', type: Object }),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], ReEvaluateAfterApplyDto.prototype, "appliedSchedule", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '一天结束时间（分钟）', example: 1200 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ReEvaluateAfterApplyDto.prototype, "dayEndMin", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '日期（ISO 8601 date）', example: '2026-12-25' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ReEvaluateAfterApplyDto.prototype, "dateISO", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '星期几（0=周日, 1=周一, ..., 6=周六）', example: 0, enum: [0, 1, 2, 3, 4, 5, 6] }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsEnum)([0, 1, 2, 3, 4, 5, 6]),
    __metadata("design:type", Number)
], ReEvaluateAfterApplyDto.prototype, "dayOfWeek", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'POI 查找表（Map<string, Poi>）', type: Object }),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], ReEvaluateAfterApplyDto.prototype, "poiLookup", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '复评使用更高的 samples', example: 600, default: 600 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], ReEvaluateAfterApplyDto.prototype, "reEvaluateSamples", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '评估配置（seed 建议使用候选派生 seed）',
        type: Object,
        example: { seed: 42000123 },
    }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], ReEvaluateAfterApplyDto.prototype, "config", void 0);
//# sourceMappingURL=re-evaluate-after-apply.dto.js.map