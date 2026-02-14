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
var CountriesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CountriesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const currency_math_util_1 = require("../common/utils/currency-math.util");
const country_pack_config_1 = require("../trips/readiness/config/country-pack.config");
let CountriesService = CountriesService_1 = class CountriesService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(CountriesService_1.name);
    }
    async getCurrencyStrategy(countryCode) {
        const profile = await this.prisma.countryProfile.findUnique({
            where: { isoCode: countryCode.toUpperCase() },
        });
        if (!profile) {
            throw new common_1.NotFoundException(`未找到国家代码为 ${countryCode} 的国家档案`);
        }
        let quickRule;
        let quickTip;
        let quickTable;
        if (profile.exchangeRateToCNY && profile.currencyCode) {
            quickRule = currency_math_util_1.CurrencyMathUtil.generateRule(profile.exchangeRateToCNY);
            quickTip = currency_math_util_1.CurrencyMathUtil.formatTip(profile.exchangeRateToCNY, profile.currencyCode, profile.currencyName || undefined);
            quickTable = currency_math_util_1.CurrencyMathUtil.generateQuickTable(profile.exchangeRateToCNY);
        }
        const paymentAdvice = profile.paymentInfo;
        return {
            countryCode: profile.isoCode,
            countryName: profile.nameCN,
            currencyCode: profile.currencyCode || '',
            currencyName: profile.currencyName || '',
            paymentType: profile.paymentType || 'BALANCED',
            exchangeRateToCNY: profile.exchangeRateToCNY || undefined,
            exchangeRateToUSD: profile.exchangeRateToUSD || undefined,
            quickRule,
            quickTip,
            quickTable,
            paymentAdvice: paymentAdvice
                ? {
                    tipping: paymentAdvice.tipping || paymentAdvice.tips,
                    atm_network: paymentAdvice.atm_network,
                    wallet_apps: paymentAdvice.wallet_apps || paymentAdvice.apps,
                    cash_preparation: paymentAdvice.cash_preparation,
                }
                : undefined,
        };
    }
    async findAll(query) {
        const maxLimit = 1000;
        let { q, limit, offset = 0 } = query;
        if (limit === undefined) {
            const totalCount = await this.prisma.countryProfile.count({
                where: q ? {
                    OR: [
                        { nameCN: { contains: q.trim() } },
                        { nameEN: { contains: q.trim(), mode: 'insensitive' } },
                        { isoCode: { contains: q.trim().toUpperCase() } },
                    ],
                } : {},
            });
            limit = totalCount;
            this.logger.debug(`[CountriesService.findAll] 未指定limit，自动设置为总数: ${limit}`);
        }
        if (limit > maxLimit) {
            limit = maxLimit;
            this.logger.warn(`[CountriesService.findAll] limit超过最大值${maxLimit}，已自动调整为${maxLimit}`);
        }
        try {
            this.logger.debug(`[CountriesService.findAll] 收到查询参数: ${JSON.stringify({ q, limit, offset })}`);
            const whereCondition = {};
            if (q) {
                const searchTerm = q.trim();
                const upperSearchTerm = searchTerm.toUpperCase();
                whereCondition.OR = [
                    { nameCN: { contains: searchTerm } },
                    { nameEN: { contains: searchTerm, mode: 'insensitive' } },
                    { isoCode: { contains: upperSearchTerm } },
                ];
                this.logger.debug(`[CountriesService.findAll] 搜索关键词: ${searchTerm}`);
            }
            const total = await this.prisma.countryProfile.count({
                where: whereCondition,
            });
            const countries = await this.prisma.countryProfile.findMany({
                where: whereCondition,
                select: {
                    isoCode: true,
                    nameCN: true,
                    nameEN: true,
                    currencyCode: true,
                    currencyName: true,
                    paymentType: true,
                    exchangeRateToCNY: true,
                    exchangeRateToUSD: true,
                },
                take: limit,
                skip: offset,
                orderBy: {
                    nameCN: 'asc',
                },
            });
            const hasMore = offset + countries.length < total;
            this.logger.debug(`[CountriesService.findAll] ✅ 查询结果: ${countries.length} 个国家 (total=${total}, hasMore=${hasMore})`);
            return {
                countries,
                total,
                hasMore,
                limit,
                offset,
            };
        }
        catch (error) {
            this.logger.error(`Failed to find countries: ${error.message}`, error.stack);
            throw error;
        }
    }
    async getCountryPack(countryCode) {
        const pack = (0, country_pack_config_1.getCountryPack)(countryCode);
        return {
            countryCode: pack.countryCode,
            countryName: pack.countryName,
            riskThresholds: pack.riskThresholds,
            effortLevelMapping: pack.effortLevelMapping,
            terrainConstraints: pack.terrainConstraints,
        };
    }
    async getAllCountryPacks() {
        return Object.values(country_pack_config_1.COUNTRY_PACKS).map(pack => ({
            countryCode: pack.countryCode,
            countryName: pack.countryName,
            riskThresholds: pack.riskThresholds,
            effortLevelMapping: pack.effortLevelMapping,
            terrainConstraints: pack.terrainConstraints,
        }));
    }
    async createOrUpdateCountryPack(countryCode, dto) {
        throw new common_1.NotFoundException(`Country Pack 配置目前通过配置文件管理。请修改 src/trips/readiness/config/country-pack.config.ts 中的 COUNTRY_PACKS 配置。` +
            `国家代码: ${countryCode}`);
    }
    async getCountryProfile(countryCode) {
        const profile = await this.prisma.countryProfile.findUnique({
            where: { isoCode: countryCode.toUpperCase() },
        });
        if (!profile) {
            throw new common_1.NotFoundException(`未找到国家代码为 ${countryCode} 的国家档案`);
        }
        return {
            isoCode: profile.isoCode,
            nameCN: profile.nameCN,
            nameEN: profile.nameEN || undefined,
            updatedAt: profile.updatedAt,
            currencyCode: profile.currencyCode || undefined,
            currencyName: profile.currencyName || undefined,
            exchangeRateToCNY: profile.exchangeRateToCNY || undefined,
            exchangeRateToUSD: profile.exchangeRateToUSD || undefined,
            paymentType: profile.paymentType || undefined,
            paymentInfo: profile.paymentInfo || undefined,
            powerInfo: profile.powerInfo || undefined,
            emergency: profile.emergency || undefined,
            visaForCN: profile.visaForCN || undefined,
            complianceInfo: profile.complianceInfo || undefined,
            travelCulture: profile.travelCulture || undefined,
        };
    }
};
exports.CountriesService = CountriesService;
exports.CountriesService = CountriesService = CountriesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CountriesService);
//# sourceMappingURL=countries.service.js.map