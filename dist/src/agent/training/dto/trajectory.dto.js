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
exports.ValidateTrajectoryResponseDto = exports.CollectTrajectoryResponseDto = exports.ValidateTrajectoryDto = exports.CollectTrajectoryDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class CollectTrajectoryDto {
}
exports.CollectTrajectoryDto = CollectTrajectoryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '请求ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CollectTrajectoryDto.prototype, "requestId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '行程ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CollectTrajectoryDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '生成的计划' }),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], CollectTrajectoryDto.prototype, "plan", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '决策链' }),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], CollectTrajectoryDto.prototype, "decisionTrace", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '研究数据' }),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], CollectTrajectoryDto.prototype, "researchData", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Gate评估结果' }),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], CollectTrajectoryDto.prototype, "gateResult", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Compliance评估结果' }),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], CollectTrajectoryDto.prototype, "complianceResult", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '模型版本', default: 'v1.0' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CollectTrajectoryDto.prototype, "modelVersion", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '国家代码' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CollectTrajectoryDto.prototype, "countryCode", void 0);
class ValidateTrajectoryDto {
}
exports.ValidateTrajectoryDto = ValidateTrajectoryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Gate评估结果（如果为空，从数据库读取）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], ValidateTrajectoryDto.prototype, "gateResult", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Compliance评估结果（如果为空，从数据库读取）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], ValidateTrajectoryDto.prototype, "complianceResult", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '用户审批状态' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ValidateTrajectoryDto.prototype, "userApproval", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '执行结果' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], ValidateTrajectoryDto.prototype, "executionResult", void 0);
class CollectTrajectoryResponseDto {
}
exports.CollectTrajectoryResponseDto = CollectTrajectoryResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '轨迹ID' }),
    __metadata("design:type", String)
], CollectTrajectoryResponseDto.prototype, "trajectoryId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '状态' }),
    __metadata("design:type", String)
], CollectTrajectoryResponseDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '验证分数' }),
    __metadata("design:type", Number)
], CollectTrajectoryResponseDto.prototype, "validationScore", void 0);
class ValidateTrajectoryResponseDto {
}
exports.ValidateTrajectoryResponseDto = ValidateTrajectoryResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否有效' }),
    __metadata("design:type", Boolean)
], ValidateTrajectoryResponseDto.prototype, "isValid", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '验证分数（0-1）' }),
    __metadata("design:type", Number)
], ValidateTrajectoryResponseDto.prototype, "score", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '验证原因' }),
    __metadata("design:type", Array)
], ValidateTrajectoryResponseDto.prototype, "reasons", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '验证状态' }),
    __metadata("design:type", String)
], ValidateTrajectoryResponseDto.prototype, "validationStatus", void 0);
//# sourceMappingURL=trajectory.dto.js.map