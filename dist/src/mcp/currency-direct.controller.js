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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrencyDirectController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const currency_direct_service_1 = require("./currency-direct.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
let CurrencyDirectController = class CurrencyDirectController {
    constructor(currencyService) {
        this.currencyService = currencyService;
    }
    async health() {
        return {
            success: true,
            available: this.currencyService.isServiceAvailable(),
        };
    }
    async getLatestRates(base, symbols) {
        try {
            const params = {
                base: base || 'USD',
            };
            if (symbols) {
                params.symbols = symbols.split(',').map(s => s.trim().toUpperCase());
            }
            const result = await this.currencyService.getLatestRates(params);
            return {
                success: true,
                ...result,
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'CURRENCY_ERROR',
                    message: error.message || 'Failed to get latest rates',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getHistoricalRates(date, base, symbols) {
        try {
            if (!date) {
                throw new common_1.HttpException({
                    success: false,
                    error: {
                        code: 'INVALID_PARAMS',
                        message: 'Date parameter is required (YYYY-MM-DD)',
                    },
                }, common_1.HttpStatus.BAD_REQUEST);
            }
            const params = {
                date,
                base: base || 'USD',
            };
            if (symbols) {
                params.symbols = symbols.split(',').map(s => s.trim().toUpperCase());
            }
            const result = await this.currencyService.getHistoricalRates(params);
            return {
                success: true,
                ...result,
            };
        }
        catch (error) {
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'CURRENCY_ERROR',
                    message: error.message || 'Failed to get historical rates',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async convertCurrency(body) {
        try {
            const result = await this.currencyService.convertCurrency(body);
            return {
                success: true,
                ...result,
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'CURRENCY_ERROR',
                    message: error.message || 'Failed to convert currency',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async convertMultipleCurrencies(body) {
        try {
            const results = await this.currencyService.convertMultipleCurrencies(body.amount, body.from, body.to);
            return {
                success: true,
                amount: body.amount,
                from: body.from,
                results,
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'CURRENCY_ERROR',
                    message: error.message || 'Failed to convert multiple currencies',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getRateTrend(from, to, days) {
        try {
            if (!from || !to) {
                throw new common_1.HttpException({
                    success: false,
                    error: {
                        code: 'INVALID_PARAMS',
                        message: 'from and to parameters are required',
                    },
                }, common_1.HttpStatus.BAD_REQUEST);
            }
            const daysCount = days ? parseInt(days) : 7;
            const trends = await this.currencyService.getRateTrend(from.toUpperCase(), to.toUpperCase(), daysCount);
            return {
                success: true,
                from: from.toUpperCase(),
                to: to.toUpperCase(),
                trends,
            };
        }
        catch (error) {
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'CURRENCY_ERROR',
                    message: error.message || 'Failed to get rate trend',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getSupportedCurrencies() {
        try {
            const currencies = this.currencyService.getSupportedCurrencies();
            return {
                success: true,
                currencies,
                count: currencies.length,
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'CURRENCY_ERROR',
                    message: error.message || 'Failed to get supported currencies',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getUserCurrencySettings(user) {
        try {
            const settings = await this.currencyService.getUserCurrencySettings(user.id);
            return {
                success: true,
                settings: settings || {
                    defaultCurrency: 'USD',
                    preferredCurrencies: [],
                },
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'CURRENCY_ERROR',
                    message: error.message || 'Failed to get user currency settings',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async saveUserCurrencySettings(user, body) {
        try {
            await this.currencyService.saveUserCurrencySettings(user.id, body);
            return {
                success: true,
                message: 'Settings saved successfully',
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'CURRENCY_ERROR',
                    message: error.message || 'Failed to save user currency settings',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.CurrencyDirectController = CurrencyDirectController;
__decorate([
    (0, common_1.Get)('health'),
    (0, swagger_1.ApiOperation)({ summary: '检查 Currency Exchange 服务状态' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '服务状态' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CurrencyDirectController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('latest'),
    (0, swagger_1.ApiOperation)({ summary: '获取最新汇率' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '最新汇率' }),
    __param(0, (0, common_1.Query)('base')),
    __param(1, (0, common_1.Query)('symbols')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], CurrencyDirectController.prototype, "getLatestRates", null);
__decorate([
    (0, common_1.Get)('historical'),
    (0, swagger_1.ApiOperation)({ summary: '获取历史汇率' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '历史汇率' }),
    __param(0, (0, common_1.Query)('date')),
    __param(1, (0, common_1.Query)('base')),
    __param(2, (0, common_1.Query)('symbols')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], CurrencyDirectController.prototype, "getHistoricalRates", null);
__decorate([
    (0, common_1.Post)('convert'),
    (0, swagger_1.ApiOperation)({ summary: '货币转换' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '转换结果' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CurrencyDirectController.prototype, "convertCurrency", null);
__decorate([
    (0, common_1.Post)('convert-multiple'),
    (0, swagger_1.ApiOperation)({ summary: '批量货币转换' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '批量转换结果' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CurrencyDirectController.prototype, "convertMultipleCurrencies", null);
__decorate([
    (0, common_1.Get)('trend'),
    (0, swagger_1.ApiOperation)({ summary: '获取汇率趋势' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '汇率趋势数据' }),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __param(2, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], CurrencyDirectController.prototype, "getRateTrend", null);
__decorate([
    (0, common_1.Get)('supported'),
    (0, swagger_1.ApiOperation)({ summary: '获取支持的货币列表' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '支持的货币列表' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CurrencyDirectController.prototype, "getSupportedCurrencies", null);
__decorate([
    (0, common_1.Get)('settings'),
    (0, swagger_1.ApiOperation)({ summary: '获取用户货币设置' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '用户设置' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CurrencyDirectController.prototype, "getUserCurrencySettings", null);
__decorate([
    (0, common_1.Post)('settings'),
    (0, swagger_1.ApiOperation)({ summary: '保存用户货币设置' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '设置保存成功' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CurrencyDirectController.prototype, "saveUserCurrencySettings", null);
exports.CurrencyDirectController = CurrencyDirectController = __decorate([
    (0, swagger_1.ApiTags)('currency'),
    (0, common_1.Controller)('api/currency'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __metadata("design:paramtypes", [currency_direct_service_1.CurrencyDirectService])
], CurrencyDirectController);
//# sourceMappingURL=currency-direct.controller.js.map