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
exports.GeneratePlanRequestDto = exports.PlanOptionsDto = exports.PlanConstraintsDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const recommendations_request_dto_1 = require("./recommendations-request.dto");
class PlanConstraintsDto {
}
exports.PlanConstraintsDto = PlanConstraintsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '最大天数' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], PlanConstraintsDto.prototype, "maxDays", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '必须包含的地点', type: [String] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], PlanConstraintsDto.prototype, "mustInclude", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '排除的地点', type: [String] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], PlanConstraintsDto.prototype, "exclude", void 0);
class PlanOptionsDto {
}
exports.PlanOptionsDto = PlanOptionsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '生成方案数量', default: 3, minimum: 1, maximum: 10 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], PlanOptionsDto.prototype, "count", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否包含预算估算', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], PlanOptionsDto.prototype, "includeBudget", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否包含三人格评价', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], PlanOptionsDto.prototype, "includePersonas", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否包含AI解释（AI增强）', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], PlanOptionsDto.prototype, "includeExplanation", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否包含优化建议（AI增强）', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], PlanOptionsDto.prototype, "includeOptimizationTips", void 0);
class GeneratePlanRequestDto {
}
exports.GeneratePlanRequestDto = GeneratePlanRequestDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '会话ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GeneratePlanRequestDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '用户ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GeneratePlanRequestDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '目的地（如果提供naturalLanguageDescription则可选）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GeneratePlanRequestDto.prototype, "destination", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '自然语言描述（AI增强）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GeneratePlanRequestDto.prototype, "naturalLanguageDescription", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '偏好' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => recommendations_request_dto_1.PreferencesDto),
    __metadata("design:type", recommendations_request_dto_1.PreferencesDto)
], GeneratePlanRequestDto.prototype, "preferences", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '约束条件' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => PlanConstraintsDto),
    __metadata("design:type", PlanConstraintsDto)
], GeneratePlanRequestDto.prototype, "constraints", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '生成选项' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => PlanOptionsDto),
    __metadata("design:type", PlanOptionsDto)
], GeneratePlanRequestDto.prototype, "options", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '语言', enum: ['en', 'zh'], default: 'zh' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['en', 'zh']),
    __metadata("design:type", String)
], GeneratePlanRequestDto.prototype, "language", void 0);
//# sourceMappingURL=generate-plan-request.dto.js.map