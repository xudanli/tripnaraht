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
exports.CountryProfileDto = exports.TravelCultureDto = exports.ComplianceInfoDto = exports.VisaInfoDto = exports.EmergencyInfoDto = exports.PowerInfoDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
class PowerInfoDto {
}
exports.PowerInfoDto = PowerInfoDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '电压（V）', example: 100 }),
    __metadata("design:type", Number)
], PowerInfoDto.prototype, "voltage", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '频率（Hz）', example: 50 }),
    __metadata("design:type", Number)
], PowerInfoDto.prototype, "frequency", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '插座类型数组', example: ['A', 'B'], type: [String] }),
    __metadata("design:type", Array)
], PowerInfoDto.prototype, "plugTypes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '备注信息' }),
    __metadata("design:type", String)
], PowerInfoDto.prototype, "note", void 0);
class EmergencyInfoDto {
}
exports.EmergencyInfoDto = EmergencyInfoDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '警察电话', example: '110' }),
    __metadata("design:type", String)
], EmergencyInfoDto.prototype, "police", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '火警电话', example: '119' }),
    __metadata("design:type", String)
], EmergencyInfoDto.prototype, "fire", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '医疗电话', example: '119' }),
    __metadata("design:type", String)
], EmergencyInfoDto.prototype, "medical", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '救护车电话', example: '119' }),
    __metadata("design:type", String)
], EmergencyInfoDto.prototype, "ambulance", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '备注信息' }),
    __metadata("design:type", String)
], EmergencyInfoDto.prototype, "note", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '大使馆联系方式' }),
    __metadata("design:type", Object)
], EmergencyInfoDto.prototype, "embassy", void 0);
class VisaInfoDto {
}
exports.VisaInfoDto = VisaInfoDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否需要签证', example: false }),
    __metadata("design:type", Boolean)
], VisaInfoDto.prototype, "required", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '签证类型', example: '免签' }),
    __metadata("design:type", String)
], VisaInfoDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '停留期限', example: '15天' }),
    __metadata("design:type", String)
], VisaInfoDto.prototype, "duration", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '申请要求', type: [String] }),
    __metadata("design:type", Array)
], VisaInfoDto.prototype, "requirements", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '备注信息' }),
    __metadata("design:type", String)
], VisaInfoDto.prototype, "notes", void 0);
class ComplianceInfoDto {
}
exports.ComplianceInfoDto = ComplianceInfoDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '签证政策' }),
    __metadata("design:type", Object)
], ComplianceInfoDto.prototype, "visaPolicy", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '驾驶规则' }),
    __metadata("design:type", Object)
], ComplianceInfoDto.prototype, "drivingRules", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '无人机规则' }),
    __metadata("design:type", Object)
], ComplianceInfoDto.prototype, "droneRules", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '酒精政策' }),
    __metadata("design:type", Object)
], ComplianceInfoDto.prototype, "alcoholPolicy", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '旅行警告' }),
    __metadata("design:type", Object)
], ComplianceInfoDto.prototype, "travelWarnings", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '海关规定' }),
    __metadata("design:type", Object)
], ComplianceInfoDto.prototype, "customs", void 0);
class TravelCultureDto {
}
exports.TravelCultureDto = TravelCultureDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '小费文化' }),
    __metadata("design:type", String)
], TravelCultureDto.prototype, "tipping", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '禁忌列表', type: [String] }),
    __metadata("design:type", Array)
], TravelCultureDto.prototype, "taboos", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '着装提示' }),
    __metadata("design:type", String)
], TravelCultureDto.prototype, "dressCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '节庆日历' }),
    __metadata("design:type", Array)
], TravelCultureDto.prototype, "festivals", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '礼仪提示' }),
    __metadata("design:type", String)
], TravelCultureDto.prototype, "etiquette", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '风俗习惯' }),
    __metadata("design:type", Object)
], TravelCultureDto.prototype, "customs", void 0);
class CountryProfileDto {
}
exports.CountryProfileDto = CountryProfileDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '国家代码（ISO 3166-1 alpha-2）', example: 'JP' }),
    __metadata("design:type", String)
], CountryProfileDto.prototype, "isoCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '国家中文名称', example: '日本' }),
    __metadata("design:type", String)
], CountryProfileDto.prototype, "nameCN", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '国家英文名称', example: 'Japan' }),
    __metadata("design:type", String)
], CountryProfileDto.prototype, "nameEN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '最后更新时间' }),
    __metadata("design:type", Date)
], CountryProfileDto.prototype, "updatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '货币代码（ISO 4217）', example: 'JPY' }),
    __metadata("design:type", String)
], CountryProfileDto.prototype, "currencyCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '货币名称', example: '日元' }),
    __metadata("design:type", String)
], CountryProfileDto.prototype, "currencyName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '汇率（1 外币 = 多少 CNY）🇨🇳 中国特定', example: 0.0483 }),
    __metadata("design:type", Number)
], CountryProfileDto.prototype, "exchangeRateToCNY", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '汇率（1 外币 = 多少 USD）🌍 国际化', example: 0.0067 }),
    __metadata("design:type", Number)
], CountryProfileDto.prototype, "exchangeRateToUSD", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '支付画像类型', enum: client_1.PaymentType, example: client_1.PaymentType.CASH_HEAVY }),
    __metadata("design:type", String)
], CountryProfileDto.prototype, "paymentType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '支付详细信息',
        example: {
            tipping: '绝对不要给小费',
            atm_network: '7-11 ATM支持银联取现',
            wallet_apps: ['Suica', 'PayPay'],
            cash_preparation: '建议准备少量现金',
        },
    }),
    __metadata("design:type", Object)
], CountryProfileDto.prototype, "paymentInfo", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '电源信息', type: PowerInfoDto }),
    __metadata("design:type", PowerInfoDto)
], CountryProfileDto.prototype, "powerInfo", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '紧急信息', type: EmergencyInfoDto }),
    __metadata("design:type", EmergencyInfoDto)
], CountryProfileDto.prototype, "emergency", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '中国公民签证信息', type: VisaInfoDto }),
    __metadata("design:type", VisaInfoDto)
], CountryProfileDto.prototype, "visaForCN", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '合规信息', type: ComplianceInfoDto }),
    __metadata("design:type", ComplianceInfoDto)
], CountryProfileDto.prototype, "complianceInfo", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '旅行文化', type: TravelCultureDto }),
    __metadata("design:type", TravelCultureDto)
], CountryProfileDto.prototype, "travelCulture", void 0);
//# sourceMappingURL=country-profile.dto.js.map