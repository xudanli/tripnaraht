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
exports.PassProfileWizardDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class PassProfileWizardDto {
}
exports.PassProfileWizardDto = PassProfileWizardDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '居住国（ISO 3166-1 alpha-2），用于判断 Eurail/Interrail' }),
    __metadata("design:type", String)
], PassProfileWizardDto.prototype, "residencyCountry", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['GLOBAL', 'ONE_COUNTRY'], description: 'Pass 类型：Global（多国）还是 One Country（单国）' }),
    __metadata("design:type", String)
], PassProfileWizardDto.prototype, "passType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '如果 passType 为 ONE_COUNTRY，指定是哪一个国家（ISO 3166-1 alpha-2）' }),
    __metadata("design:type", String)
], PassProfileWizardDto.prototype, "oneCountryCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['FLEXI', 'CONTINUOUS'], description: '有效期类型：Flexi（例如 1 个月内任选 7 天）还是 Continuous（例如连续 15 天）' }),
    __metadata("design:type", String)
], PassProfileWizardDto.prototype, "validityType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '如果是 FLEXI，指定 Travel Days 总数（例如 7 天、10 天）' }),
    __metadata("design:type", Number)
], PassProfileWizardDto.prototype, "travelDaysTotal", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['MOBILE', 'PAPER'], description: '载体类型：mobile（手机）还是 paper（纸票）。如果不提供，系统会按未知处理' }),
    __metadata("design:type", String)
], PassProfileWizardDto.prototype, "mobileOrPaper", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['FIRST', 'SECOND'], description: 'Pass 等级：First 还是 Second。如果不提供，默认 Second' }),
    __metadata("design:type", String)
], PassProfileWizardDto.prototype, "class", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Pass 有效期开始日期（如果不提供，会从行程开始日期推断）' }),
    __metadata("design:type", String)
], PassProfileWizardDto.prototype, "validityStartDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Pass 有效期结束日期（如果不提供，会从行程结束日期推断）' }),
    __metadata("design:type", String)
], PassProfileWizardDto.prototype, "validityEndDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Trip ID，用于关联到行程' }),
    __metadata("design:type", String)
], PassProfileWizardDto.prototype, "tripId", void 0);
//# sourceMappingURL=pass-profile-wizard.dto.js.map