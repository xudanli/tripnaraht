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
exports.CurrencyStrategyDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
class CurrencyStrategyDto {
}
exports.CurrencyStrategyDto = CurrencyStrategyDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '国家代码（ISO 3166-1 alpha-2）',
        example: 'JP',
    }),
    __metadata("design:type", String)
], CurrencyStrategyDto.prototype, "countryCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '国家中文名称',
        example: '日本',
    }),
    __metadata("design:type", String)
], CurrencyStrategyDto.prototype, "countryName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '货币代码',
        example: 'JPY',
    }),
    __metadata("design:type", String)
], CurrencyStrategyDto.prototype, "currencyCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '货币名称',
        example: '日元',
    }),
    __metadata("design:type", String)
], CurrencyStrategyDto.prototype, "currencyName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '支付画像类型',
        enum: client_1.PaymentType,
        example: client_1.PaymentType.CASH_HEAVY,
    }),
    __metadata("design:type", String)
], CurrencyStrategyDto.prototype, "paymentType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '汇率（1 外币 = 多少 CNY）🇨🇳 中国特定字段：仅对中国用户有意义',
        example: 0.0483,
        nullable: true,
    }),
    __metadata("design:type", Number)
], CurrencyStrategyDto.prototype, "exchangeRateToCNY", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '汇率（1 外币 = 多少 USD）🌍 国际化字段：国际标准基准，适用于所有用户',
        example: 0.0067,
        nullable: true,
    }),
    __metadata("design:type", Number)
], CurrencyStrategyDto.prototype, "exchangeRateToUSD", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '速算口诀 🇨🇳 中国特定字段：基于CNY汇率计算',
        example: '直接除以 20',
        nullable: true,
    }),
    __metadata("design:type", String)
], CurrencyStrategyDto.prototype, "quickRule", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '速算提示文本 🇨🇳 中国特定字段：基于CNY汇率计算',
        example: '看到价格 直接除以 20 即为人民币\n例：日元1,000 ≈ 48 元',
        nullable: true,
    }),
    __metadata("design:type", String)
], CurrencyStrategyDto.prototype, "quickTip", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '快速对照表 🇨🇳 中国特定字段：基于CNY汇率计算',
        type: 'array',
        items: {
            type: 'object',
            properties: {
                local: { type: 'number', example: 1000 },
                home: { type: 'number', example: 48 },
            },
        },
        nullable: true,
    }),
    __metadata("design:type", Array)
], CurrencyStrategyDto.prototype, "quickTable", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '支付实用建议',
        example: {
            tipping: '绝对不要给小费，会被视为无礼',
            atm_network: '7-11 ATM支持银联取现',
            wallet_apps: ['Suica (Apple Pay)', 'PayPay'],
            cash_preparation: '硬币使用极高，务必准备零钱袋',
        },
    }),
    __metadata("design:type", Object)
], CurrencyStrategyDto.prototype, "paymentAdvice", void 0);
//# sourceMappingURL=currency-strategy.dto.js.map