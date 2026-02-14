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
var CountriesController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CountriesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const countries_service_1 = require("./countries.service");
const country_pack_dto_1 = require("./dto/country-pack.dto");
const get_countries_query_dto_1 = require("./dto/get-countries-query.dto");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
let CountriesController = CountriesController_1 = class CountriesController {
    constructor(countriesService) {
        this.countriesService = countriesService;
        this.logger = new common_1.Logger(CountriesController_1.name);
    }
    async getAllCountryPacks() {
        try {
            const packs = await this.countriesService.getAllCountryPacks();
            return (0, standard_response_dto_1.successResponse)(packs);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async findAll(query) {
        try {
            this.logger.debug(`[CountriesController] 收到国家查询请求: ${JSON.stringify(query)}`);
            const result = await this.countriesService.findAll(query);
            this.logger.debug(`[CountriesController] ✅ 返回国家列表: ${result.countries.length} 个国家 (total=${result.total}, hasMore=${result.hasMore})`);
            return (0, standard_response_dto_1.successResponse)({
                countries: result.countries,
                total: result.total,
                hasMore: result.hasMore,
                limit: result.limit,
                offset: result.offset,
            });
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to get countries: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async getCountryProfile(countryCode) {
        try {
            const profile = await this.countriesService.getCountryProfile(countryCode);
            return (0, standard_response_dto_1.successResponse)(profile);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            this.logger.error(`Failed to get country profile: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getCurrencyStrategy(countryCode) {
        try {
            const strategy = await this.countriesService.getCurrencyStrategy(countryCode);
            return (0, standard_response_dto_1.successResponse)(strategy);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            throw error;
        }
    }
    async getCountryPack(countryCode) {
        try {
            const pack = await this.countriesService.getCountryPack(countryCode);
            return (0, standard_response_dto_1.successResponse)(pack);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async createOrUpdateCountryPack(countryCode, dto) {
        try {
            const pack = await this.countriesService.createOrUpdateCountryPack(countryCode, dto);
            return (0, standard_response_dto_1.successResponse)(pack);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getPaymentInfo(countryCode) {
        var _a, _b, _c, _d;
        try {
            const strategy = await this.countriesService.getCurrencyStrategy(countryCode);
            return (0, standard_response_dto_1.successResponse)({
                countryCode: strategy.countryCode,
                countryName: strategy.countryName,
                currency: {
                    code: strategy.currencyCode,
                    name: strategy.currencyName,
                    exchangeRateToCNY: strategy.exchangeRateToCNY,
                    exchangeRateToUSD: strategy.exchangeRateToUSD,
                    quickRule: strategy.quickRule,
                    quickTip: strategy.quickTip,
                    quickTable: strategy.quickTable,
                },
                paymentMethods: {
                    type: strategy.paymentType,
                    advice: strategy.paymentAdvice,
                },
                practicalTips: {
                    tipping: ((_a = strategy.paymentAdvice) === null || _a === void 0 ? void 0 : _a.tipping) || '请查看当地小费习惯',
                    atmNetworks: ((_b = strategy.paymentAdvice) === null || _b === void 0 ? void 0 : _b.atm_network) || '请查询支持银联的ATM网络',
                    walletApps: ((_c = strategy.paymentAdvice) === null || _c === void 0 ? void 0 : _c.wallet_apps) || [],
                    cashPreparation: ((_d = strategy.paymentAdvice) === null || _d === void 0 ? void 0 : _d.cash_preparation) || '建议准备少量现金',
                },
                merchantInfo: {
                    unionPaySupported: '请查询当地商户',
                    popularMerchantTypes: ['请查询当地热门商户'],
                },
            });
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getTerrainAdvice(countryCode) {
        var _a, _b;
        try {
            const pack = await this.countriesService.getCountryPack(countryCode);
            return (0, standard_response_dto_1.successResponse)({
                countryCode: pack.countryCode,
                terrainConfig: {
                    riskThresholds: pack.riskThresholds,
                    effortLevelMapping: pack.effortLevelMapping,
                    terrainConstraints: pack.terrainConstraints,
                },
                adaptationStrategies: {
                    highAltitude: ((_a = pack.riskThresholds) === null || _a === void 0 ? void 0 : _a.highAltitudeM)
                        ? `海拔超过 ${pack.riskThresholds.highAltitudeM}m 时，建议进行高反风险评估和适应计划`
                        : '请根据实际海拔调整',
                    routeRisk: ((_b = pack.riskThresholds) === null || _b === void 0 ? void 0 : _b.steepSlopePct)
                        ? `陡坡阈值：${pack.riskThresholds.steepSlopePct}%`
                        : '请根据路线难度评估',
                },
                equipmentRecommendations: {
                    basedOnTerrain: '请根据地形配置选择合适的装备',
                    trainingAdvice: '建议提前进行体力训练，特别是高海拔地区',
                },
                seasonalConstraints: {
                    roadAccess: '请查询季节性道路通行时间限制',
                    weatherImpact: '请关注季节性天气对路线的影响',
                },
            });
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
};
exports.CountriesController = CountriesController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('packs'),
    (0, swagger_1.ApiOperation)({
        summary: '获取所有国家 Pack 配置列表',
        description: '返回所有已配置的国家 Pack 列表，包括风险阈值、体力等级映射、地形约束等',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回所有国家 Pack 配置列表',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CountriesController.prototype, "getAllCountryPacks", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: '获取国家列表',
        description: '支持搜索和分页。可以按中文名、英文名或国家代码搜索。',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'q',
        required: false,
        description: '搜索关键词（支持中文名、英文名、国家代码），例如：日本',
        example: '日本',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'limit',
        required: false,
        description: '返回数量限制（最大1000，不指定则返回所有国家）',
        example: 100,
        type: Number,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'offset',
        required: false,
        description: '偏移量（用于分页）',
        example: 0,
        type: Number,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回国家列表（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [get_countries_query_dto_1.GetCountriesQueryDto]),
    __metadata("design:returntype", Promise)
], CountriesController.prototype, "findAll", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':countryCode/profile'),
    (0, swagger_1.ApiOperation)({
        summary: '获取完整的国家档案信息',
        description: '返回指定国家的完整档案信息，包括：\n' +
            '- 基础信息（国家代码、名称、更新时间）\n' +
            '- 货币和支付信息（货币代码、汇率、支付类型、支付建议）\n' +
            '- 电源信息（电压、频率、插座类型）\n' +
            '- 紧急信息（报警电话、医疗电话等）\n' +
            '- 签证信息（针对中国公民的签证政策）\n' +
            '- 合规信息（驾驶规则、无人机规则、酒精政策等）\n' +
            '- 旅行文化（小费习惯、禁忌列表、节庆信息等）',
    }),
    (0, swagger_1.ApiParam)({
        name: 'countryCode',
        description: '国家代码（ISO 3166-1 alpha-2）',
        example: 'JP',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回完整的国家档案信息（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '未找到指定国家的档案（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('countryCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CountriesController.prototype, "getCountryProfile", null);
__decorate([
    (0, common_1.Get)(':countryCode/currency-strategy'),
    (0, swagger_1.ApiOperation)({
        summary: '获取国家的货币策略',
        description: '返回指定国家的完整货币和支付策略信息，包括：\n' +
            '- 🌍 通用字段：货币代码、支付画像、支付建议（适用于所有国家用户）\n' +
            '- 🇨🇳 中国特定字段：汇率和速算口诀（CNY基准，仅对中国用户有意义）\n' +
            '- 汇率和速算口诀（如"直接除以 20"）\n' +
            '- 支付画像（现金为主/混合/数字化）\n' +
            '- 支付实用建议（小费、ATM、钱包App等）\n' +
            '- 快速对照表（常用金额的汇率对照）',
    }),
    (0, swagger_1.ApiParam)({
        name: 'countryCode',
        description: '国家代码（ISO 3166-1 alpha-2）',
        example: 'JP',
        enum: ['JP', 'IS', 'US', 'GB', 'TH'],
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回货币策略（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '未找到指定国家的档案（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('countryCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CountriesController.prototype, "getCurrencyStrategy", null);
__decorate([
    (0, common_1.Get)(':countryCode/pack'),
    (0, swagger_1.ApiOperation)({
        summary: '获取国家 Pack 配置',
        description: '返回指定国家的地形策略配置，包括风险阈值、体力等级映射、地形约束等',
    }),
    (0, swagger_1.ApiParam)({
        name: 'countryCode',
        description: '国家代码',
        example: 'CN_XIZANG',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回国家 Pack 配置',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '未找到指定国家的 Pack 配置',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('countryCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CountriesController.prototype, "getCountryPack", null);
__decorate([
    (0, common_1.Put)(':countryCode/pack'),
    (0, swagger_1.ApiOperation)({
        summary: '创建或更新国家 Pack 配置',
        description: '创建或更新指定国家的地形策略配置。注意：目前配置通过文件管理，此接口会提示需要手动修改配置文件',
    }),
    (0, swagger_1.ApiParam)({
        name: 'countryCode',
        description: '国家代码',
        example: 'CN_XIZANG',
    }),
    (0, swagger_1.ApiBody)({ type: country_pack_dto_1.CreateOrUpdateCountryPackDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功更新国家 Pack 配置',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '更新失败（需要通过配置文件手动修改）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('countryCode')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, country_pack_dto_1.CreateOrUpdateCountryPackDto]),
    __metadata("design:returntype", Promise)
], CountriesController.prototype, "createOrUpdateCountryPack", null);
__decorate([
    (0, common_1.Get)(':countryCode/payment-info'),
    (0, swagger_1.ApiOperation)({
        summary: '获取目的地支付实用信息（故事5.1）',
        description: '获取目的地的支付规则和技巧，包括主流支付方式、小费规则、ATM取款贴士、实时汇率换算等',
    }),
    (0, swagger_1.ApiParam)({
        name: 'countryCode',
        description: '国家代码（ISO 3166-1 alpha-2）',
        example: 'JP',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回支付实用信息',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('countryCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CountriesController.prototype, "getPaymentInfo", null);
__decorate([
    (0, common_1.Get)(':countryCode/terrain-advice'),
    (0, swagger_1.ApiOperation)({
        summary: '获取目的地地形适配建议（故事5.2）',
        description: '获取目的地地形对应的行程规划要点，包括高海拔适应策略、徒步路线风险阈值、装备清单、体力训练建议等',
    }),
    (0, swagger_1.ApiParam)({
        name: 'countryCode',
        description: '国家代码',
        example: 'NP',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回地形适配建议',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('countryCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CountriesController.prototype, "getTerrainAdvice", null);
exports.CountriesController = CountriesController = CountriesController_1 = __decorate([
    (0, swagger_1.ApiTags)('countries'),
    (0, common_1.Controller)('countries'),
    __metadata("design:paramtypes", [countries_service_1.CountriesService])
], CountriesController);
//# sourceMappingURL=countries.controller.js.map