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
exports.GetExplanationQueryDto = exports.ForkVersionDto = exports.SaveVersionDto = exports.ReorderDecisionStepsDto = exports.PartialRegenerateDto = exports.BatchEditDecisionStepsDto = exports.EditDecisionStepDto = exports.GenerateDecisionDraftDto = exports.DecisionStepEditOperationDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const swagger_1 = require("@nestjs/swagger");
class DecisionStepModificationsDto {
}
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '标题' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], DecisionStepModificationsDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '描述' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], DecisionStepModificationsDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '输出列表' }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], DecisionStepModificationsDto.prototype, "outputs", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '证据权重映射' }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], DecisionStepModificationsDto.prototype, "evidence_weights", void 0);
class DecisionStepEditOperationDto {
}
exports.DecisionStepEditOperationDto = DecisionStepEditOperationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '决策步骤 ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DecisionStepEditOperationDto.prototype, "decision_step_id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '操作类型', enum: ['approve', 'reject', 'modify'] }),
    (0, class_validator_1.IsEnum)(['approve', 'reject', 'modify']),
    __metadata("design:type", String)
], DecisionStepEditOperationDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '修改内容' }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DecisionStepModificationsDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", DecisionStepModificationsDto)
], DecisionStepEditOperationDto.prototype, "modifications", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '操作理由' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], DecisionStepEditOperationDto.prototype, "reasoning", void 0);
class GenerateDecisionDraftDto {
}
exports.GenerateDecisionDraftDto = GenerateDecisionDraftDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '用户输入（自然语言）' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GenerateDecisionDraftDto.prototype, "user_input", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '旅行规划请求' }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.ValidateNested)(),
    __metadata("design:type", Object)
], GenerateDecisionDraftDto.prototype, "trip_plan_request", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '生成配置' }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], GenerateDecisionDraftDto.prototype, "config", void 0);
class EditDecisionStepDto {
}
exports.EditDecisionStepDto = EditDecisionStepDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '编辑操作' }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DecisionStepEditOperationDto),
    __metadata("design:type", DecisionStepEditOperationDto)
], EditDecisionStepDto.prototype, "operation", void 0);
class BatchEditDecisionStepsDto {
}
exports.BatchEditDecisionStepsDto = BatchEditDecisionStepsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '编辑操作列表' }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => DecisionStepEditOperationDto),
    __metadata("design:type", Array)
], BatchEditDecisionStepsDto.prototype, "operations", void 0);
class PartialRegenerateDto {
}
exports.PartialRegenerateDto = PartialRegenerateDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '局部重算配置' }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], PartialRegenerateDto.prototype, "config", void 0);
class ReorderDecisionStepsDto {
}
exports.ReorderDecisionStepsDto = ReorderDecisionStepsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '新的决策步骤顺序（decision_step_id 数组）' }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], ReorderDecisionStepsDto.prototype, "new_order", void 0);
class SaveVersionDto {
}
exports.SaveVersionDto = SaveVersionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '创建者' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SaveVersionDto.prototype, "creator", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '版本描述' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SaveVersionDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '标签' }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], SaveVersionDto.prototype, "tags", void 0);
class ForkVersionDto {
}
exports.ForkVersionDto = ForkVersionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '新的工作流 ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ForkVersionDto.prototype, "new_workflow_id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '创建者' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ForkVersionDto.prototype, "creator", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '版本描述' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ForkVersionDto.prototype, "description", void 0);
class GetExplanationQueryDto {
}
exports.GetExplanationQueryDto = GetExplanationQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '解释模式',
        enum: ['toc', 'expert', 'studio'],
        default: 'toc',
    }),
    (0, class_validator_1.IsEnum)(['toc', 'expert', 'studio']),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GetExplanationQueryDto.prototype, "mode", void 0);
//# sourceMappingURL=decision-draft.dto.js.map