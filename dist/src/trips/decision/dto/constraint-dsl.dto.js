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
exports.GenerateMultiplePlansRequestDto = exports.DetectConflictsRequestDto = exports.ConstraintDSLDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class ConstraintDSLDto {
}
exports.ConstraintDSLDto = ConstraintDSLDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '硬约束' }),
    __metadata("design:type", Object)
], ConstraintDSLDto.prototype, "hard_constraints", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '软约束' }),
    __metadata("design:type", Object)
], ConstraintDSLDto.prototype, "soft_constraints", void 0);
class DetectConflictsRequestDto {
}
exports.DetectConflictsRequestDto = DetectConflictsRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '约束DSL' }),
    __metadata("design:type", ConstraintDSLDto)
], DetectConflictsRequestDto.prototype, "constraints", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '行程计划（可选，用于更精确的冲突检测）' }),
    __metadata("design:type", Object)
], DetectConflictsRequestDto.prototype, "plan", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '世界状态（可选，用于更精确的冲突检测）' }),
    __metadata("design:type", Object)
], DetectConflictsRequestDto.prototype, "state", void 0);
class GenerateMultiplePlansRequestDto {
}
exports.GenerateMultiplePlansRequestDto = GenerateMultiplePlansRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '世界状态' }),
    __metadata("design:type", Object)
], GenerateMultiplePlansRequestDto.prototype, "state", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '约束DSL' }),
    __metadata("design:type", ConstraintDSLDto)
], GenerateMultiplePlansRequestDto.prototype, "constraints", void 0);
//# sourceMappingURL=constraint-dsl.dto.js.map