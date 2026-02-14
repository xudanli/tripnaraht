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
exports.PlanCandidateDto = exports.PersonaEvaluationDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class PersonaEvaluationDto {
}
exports.PersonaEvaluationDto = PersonaEvaluationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '冒险者评价' }),
    __metadata("design:type", Object)
], PersonaEvaluationDto.prototype, "adventurer", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '规划者评价' }),
    __metadata("design:type", Object)
], PersonaEvaluationDto.prototype, "planner", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '放松者评价' }),
    __metadata("design:type", Object)
], PersonaEvaluationDto.prototype, "relaxer", void 0);
class PlanCandidateDto {
}
exports.PlanCandidateDto = PlanCandidateDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '方案ID' }),
    __metadata("design:type", String)
], PlanCandidateDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '方案名称（英文）' }),
    __metadata("design:type", String)
], PlanCandidateDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '方案名称（中文）' }),
    __metadata("design:type", String)
], PlanCandidateDto.prototype, "nameCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '方案描述（英文）' }),
    __metadata("design:type", String)
], PlanCandidateDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '方案描述（中文）' }),
    __metadata("design:type", String)
], PlanCandidateDto.prototype, "descriptionCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '目的地' }),
    __metadata("design:type", String)
], PlanCandidateDto.prototype, "destination", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '天数' }),
    __metadata("design:type", Number)
], PlanCandidateDto.prototype, "duration", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '亮点', type: [String] }),
    __metadata("design:type", Array)
], PlanCandidateDto.prototype, "highlights", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '预估预算' }),
    __metadata("design:type", Object)
], PlanCandidateDto.prototype, "estimatedBudget", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '节奏', enum: ['relaxed', 'moderate', 'intensive'] }),
    __metadata("design:type", String)
], PlanCandidateDto.prototype, "pace", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '适合度' }),
    __metadata("design:type", Object)
], PlanCandidateDto.prototype, "suitability", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '三人格评价' }),
    __metadata("design:type", PersonaEvaluationDto)
], PlanCandidateDto.prototype, "personas", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'AI解释（AI增强）' }),
    __metadata("design:type", Object)
], PlanCandidateDto.prototype, "explanation", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '优化建议（AI增强）' }),
    __metadata("design:type", Array)
], PlanCandidateDto.prototype, "optimizationTips", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '警告', type: [String] }),
    __metadata("design:type", Array)
], PlanCandidateDto.prototype, "warnings", void 0);
//# sourceMappingURL=plan-candidate.dto.js.map