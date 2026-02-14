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
exports.PersonaAlertDto = exports.AlertSeverity = exports.PersonaType = void 0;
const swagger_1 = require("@nestjs/swagger");
var PersonaType;
(function (PersonaType) {
    PersonaType["ABU"] = "ABU";
    PersonaType["DR_DRE"] = "DR_DRE";
    PersonaType["NEPTUNE"] = "NEPTUNE";
})(PersonaType || (exports.PersonaType = PersonaType = {}));
var AlertSeverity;
(function (AlertSeverity) {
    AlertSeverity["WARNING"] = "warning";
    AlertSeverity["INFO"] = "info";
    AlertSeverity["SUCCESS"] = "success";
})(AlertSeverity || (exports.AlertSeverity = AlertSeverity = {}));
class PersonaAlertDto {
}
exports.PersonaAlertDto = PersonaAlertDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '提醒ID', example: 'alert-1' }),
    __metadata("design:type", String)
], PersonaAlertDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Persona类型', enum: PersonaType, example: PersonaType.ABU }),
    __metadata("design:type", String)
], PersonaAlertDto.prototype, "persona", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Persona名称', example: 'Abu' }),
    __metadata("design:type", String)
], PersonaAlertDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '提醒标题', example: '安全守护者 Abu（北极熊 🐻‍❄️）' }),
    __metadata("design:type", String)
], PersonaAlertDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '提醒消息', example: '我注意到北部山区 10 月份道路封闭概率较高\n建议准备备选路线\n你觉得呢？' }),
    __metadata("design:type", String)
], PersonaAlertDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '严重程度', enum: AlertSeverity, example: AlertSeverity.WARNING }),
    __metadata("design:type", String)
], PersonaAlertDto.prototype, "severity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '创建时间', example: '2024-12-30T10:00:00Z' }),
    __metadata("design:type", String)
], PersonaAlertDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '元数据', type: Object, additionalProperties: true }),
    __metadata("design:type", Object)
], PersonaAlertDto.prototype, "metadata", void 0);
//# sourceMappingURL=persona-alerts.dto.js.map