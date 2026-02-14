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
exports.ApplyOptimizationResponseDto = exports.ChangePreviewDto = exports.ApplyOptimizationRequestDto = exports.ApplyOptimizationOptionsDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class ApplyOptimizationOptionsDto {
}
exports.ApplyOptimizationOptionsDto = ApplyOptimizationOptionsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否替换现有行程项', default: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], ApplyOptimizationOptionsDto.prototype, "replaceExisting", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否保留手动编辑的项', default: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], ApplyOptimizationOptionsDto.prototype, "preserveManualEdits", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否只是预览，不实际应用', default: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], ApplyOptimizationOptionsDto.prototype, "dryRun", void 0);
class ApplyOptimizationRequestDto {
}
exports.ApplyOptimizationRequestDto = ApplyOptimizationRequestDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '优化结果 ID' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ApplyOptimizationRequestDto.prototype, "optimizationId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '优化结果数据（OptimizeRouteResponse 类型）',
        example: { route: [], timeline: [] }
    }),
    (0, class_validator_1.IsNotEmpty)({ message: '优化结果数据不能为空' }),
    (0, class_validator_1.IsObject)({ message: '优化结果数据必须是对象' }),
    __metadata("design:type", Object)
], ApplyOptimizationRequestDto.prototype, "result", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '应用选项', type: ApplyOptimizationOptionsDto }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => ApplyOptimizationOptionsDto),
    __metadata("design:type", ApplyOptimizationOptionsDto)
], ApplyOptimizationRequestDto.prototype, "options", void 0);
class ChangePreviewDto {
}
exports.ChangePreviewDto = ChangePreviewDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '日期 ID' }),
    __metadata("design:type", String)
], ChangePreviewDto.prototype, "dayId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '日期（YYYY-MM-DD）' }),
    __metadata("design:type", String)
], ChangePreviewDto.prototype, "date", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '新增项数量' }),
    __metadata("design:type", Number)
], ChangePreviewDto.prototype, "added", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '删除项数量' }),
    __metadata("design:type", Number)
], ChangePreviewDto.prototype, "removed", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '修改项数量' }),
    __metadata("design:type", Number)
], ChangePreviewDto.prototype, "modified", void 0);
class ApplyOptimizationResponseDto {
}
exports.ApplyOptimizationResponseDto = ApplyOptimizationResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否成功' }),
    __metadata("design:type", Boolean)
], ApplyOptimizationResponseDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '应用的行程项数量' }),
    __metadata("design:type", Number)
], ApplyOptimizationResponseDto.prototype, "appliedItems", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '修改的日期数组', type: [String] }),
    __metadata("design:type", Array)
], ApplyOptimizationResponseDto.prototype, "modifiedDays", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '预览数据（如果 dryRun=true）', type: [ChangePreviewDto] }),
    __metadata("design:type", Array)
], ApplyOptimizationResponseDto.prototype, "preview", void 0);
//# sourceMappingURL=trip-optimization.dto.js.map