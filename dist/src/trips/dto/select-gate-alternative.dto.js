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
exports.SelectGateAlternativeDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class SelectGateAlternativeDto {
}
exports.SelectGateAlternativeDto = SelectGateAlternativeDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '会话 ID',
        example: 'nl_user123_abc12345',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], SelectGateAlternativeDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Gate 检查 ID',
        example: 'gl_experience_activity_match',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], SelectGateAlternativeDto.prototype, "gateCheckId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '替代方案 ID（从 alternativeActions 中获取）',
        example: 'gate_alternative_gl_experience_activity_match_0',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], SelectGateAlternativeDto.prototype, "alternativeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '替代方案动作（用于更新参数）',
        example: 'set_risk_tolerance:medium',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], SelectGateAlternativeDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '用户输入（可选，用于继续澄清流程）',
        example: '好的，我选择中等风险活动',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SelectGateAlternativeDto.prototype, "userInput", void 0);
//# sourceMappingURL=select-gate-alternative.dto.js.map