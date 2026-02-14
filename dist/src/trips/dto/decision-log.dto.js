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
exports.DecisionLogResponseDto = exports.DecisionLogEntryDto = exports.PersonaType = exports.DecisionSource = void 0;
const swagger_1 = require("@nestjs/swagger");
var DecisionSource;
(function (DecisionSource) {
    DecisionSource["PHYSICAL"] = "PHYSICAL";
    DecisionSource["HUMAN"] = "HUMAN";
    DecisionSource["PHILOSOPHY"] = "PHILOSOPHY";
    DecisionSource["SPATIAL"] = "SPATIAL";
})(DecisionSource || (exports.DecisionSource = DecisionSource = {}));
var PersonaType;
(function (PersonaType) {
    PersonaType["ABU"] = "ABU";
    PersonaType["DR_DRE"] = "DR_DRE";
    PersonaType["NEPTUNE"] = "NEPTUNE";
})(PersonaType || (exports.PersonaType = PersonaType = {}));
class DecisionLogEntryDto {
}
exports.DecisionLogEntryDto = DecisionLogEntryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '记录ID', example: 'log-1' }),
    __metadata("design:type", String)
], DecisionLogEntryDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '日期时间', example: '2024-12-30T10:00:00Z' }),
    __metadata("design:type", String)
], DecisionLogEntryDto.prototype, "date", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '描述', example: '依据道路通行记录进行了风险提示' }),
    __metadata("design:type", String)
], DecisionLogEntryDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '决策来源', enum: DecisionSource, example: DecisionSource.PHYSICAL }),
    __metadata("design:type", String)
], DecisionLogEntryDto.prototype, "source", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Persona', enum: PersonaType, example: PersonaType.ABU }),
    __metadata("design:type", String)
], DecisionLogEntryDto.prototype, "persona", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '动作类型', example: 'RISK_WARNING' }),
    __metadata("design:type", String)
], DecisionLogEntryDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '元数据', type: Object, additionalProperties: true }),
    __metadata("design:type", Object)
], DecisionLogEntryDto.prototype, "metadata", void 0);
class DecisionLogResponseDto {
}
exports.DecisionLogResponseDto = DecisionLogResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '记录列表', type: [DecisionLogEntryDto] }),
    __metadata("design:type", Array)
], DecisionLogResponseDto.prototype, "items", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总记录数', example: 15 }),
    __metadata("design:type", Number)
], DecisionLogResponseDto.prototype, "total", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '返回数量限制', example: 10 }),
    __metadata("design:type", Number)
], DecisionLogResponseDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '偏移量', example: 0 }),
    __metadata("design:type", Number)
], DecisionLogResponseDto.prototype, "offset", void 0);
//# sourceMappingURL=decision-log.dto.js.map