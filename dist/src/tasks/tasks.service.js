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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var TasksService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TasksService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../prisma/prisma.service");
const axios_1 = __importDefault(require("axios"));
let TasksService = TasksService_1 = class TasksService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(TasksService_1.name);
    }
    async updateExchangeRates() {
        this.logger.log('开始更新汇率...');
        try {
            const url = 'https://api.exchangerate-api.com/v4/latest/CNY';
            const { data } = await axios_1.default.get(url, {
                timeout: 10000,
            });
            const rates = data.rates;
            if (!rates || typeof rates !== 'object') {
                throw new Error('汇率 API 返回数据格式错误');
            }
            const countries = await this.prisma.countryProfile.findMany({
                where: {
                    currencyCode: { not: null },
                },
                select: {
                    isoCode: true,
                    currencyCode: true,
                },
            });
            let updatedCount = 0;
            let errorCount = 0;
            const usdRateFromCNY = rates['USD'];
            let usdToCny;
            if (usdRateFromCNY && usdRateFromCNY > 0) {
                usdToCny = 1 / usdRateFromCNY;
            }
            for (const country of countries) {
                if (!country.currencyCode) {
                    continue;
                }
                const rateFromCNY = rates[country.currencyCode];
                if (!rateFromCNY || rateFromCNY <= 0) {
                    this.logger.warn(`未找到货币 ${country.currencyCode} 的汇率，跳过 ${country.isoCode}`);
                    errorCount++;
                    continue;
                }
                const rateToCNY = 1 / rateFromCNY;
                let rateToUSD;
                if (country.currencyCode === 'USD') {
                    rateToUSD = 1.0;
                }
                else if (usdToCny) {
                    rateToUSD = rateToCNY / usdToCny;
                }
                try {
                    const updateData = { exchangeRateToCNY: rateToCNY };
                    if (rateToUSD !== undefined) {
                        updateData.exchangeRateToUSD = rateToUSD;
                    }
                    await this.prisma.countryProfile.update({
                        where: { isoCode: country.isoCode },
                        data: updateData,
                    });
                    updatedCount++;
                    this.logger.debug(`已更新 ${country.isoCode} (${country.currencyCode}): 1 ${country.currencyCode} = ${rateToCNY.toFixed(4)} CNY${rateToUSD ? ` = ${rateToUSD.toFixed(6)} USD` : ''}`);
                }
                catch (error) {
                    this.logger.error(`更新 ${country.isoCode} 汇率失败: ${error instanceof Error ? error.message : String(error)}`);
                    errorCount++;
                }
            }
            this.logger.log(`汇率更新完成：成功 ${updatedCount} 个，失败 ${errorCount} 个`);
        }
        catch (error) {
            this.logger.error(`汇率更新任务失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
};
exports.TasksService = TasksService;
__decorate([
    (0, schedule_1.Cron)('0 4 * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TasksService.prototype, "updateExchangeRates", null);
exports.TasksService = TasksService = TasksService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TasksService);
//# sourceMappingURL=tasks.service.js.map