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
var FlightPriceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlightPriceService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let FlightPriceService = FlightPriceService_1 = class FlightPriceService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(FlightPriceService_1.name);
    }
    async getEstimatedCost(countryCode, originCity, useConservative = true) {
        const code = countryCode.toUpperCase();
        let priceRef = null;
        if (originCity) {
            priceRef = await this.prisma.flightPriceReference.findFirst({
                where: {
                    countryCode: code,
                    originCity: originCity.toUpperCase(),
                },
                orderBy: {
                    lastUpdated: 'desc',
                },
            });
        }
        if (!priceRef) {
            priceRef = await this.prisma.flightPriceReference.findFirst({
                where: {
                    countryCode: code,
                    originCity: null,
                },
                orderBy: {
                    lastUpdated: 'desc',
                },
            });
        }
        if (!priceRef) {
            this.logger.warn(`未找到国家 ${code} 的机票价格参考，使用默认值 5000 元`);
            return 5000;
        }
        const flightPrice = useConservative
            ? priceRef.highSeasonPrice
            : priceRef.averagePrice;
        const totalCost = flightPrice + priceRef.visaCost;
        this.logger.debug(`查询 ${code} 机票价格：${flightPrice} 元（${useConservative ? '旺季' : '平均'}）+ 签证 ${priceRef.visaCost} 元 = 总计 ${totalCost} 元`);
        return totalCost;
    }
    async getPriceDetails(countryCode, originCity) {
        const code = countryCode.toUpperCase();
        let priceRef = null;
        if (originCity) {
            priceRef = await this.prisma.flightPriceReference.findFirst({
                where: {
                    countryCode: code,
                    originCity: originCity.toUpperCase(),
                },
                orderBy: {
                    lastUpdated: 'desc',
                },
            });
        }
        if (!priceRef) {
            priceRef = await this.prisma.flightPriceReference.findFirst({
                where: {
                    countryCode: code,
                    originCity: null,
                },
                orderBy: {
                    lastUpdated: 'desc',
                },
            });
        }
        if (!priceRef) {
            return null;
        }
        return {
            flightPrice: {
                lowSeason: priceRef.lowSeasonPrice,
                highSeason: priceRef.highSeasonPrice,
                average: priceRef.averagePrice,
            },
            visaCost: priceRef.visaCost,
            total: {
                conservative: priceRef.highSeasonPrice + priceRef.visaCost,
                average: priceRef.averagePrice + priceRef.visaCost,
            },
            source: priceRef.source || undefined,
            lastUpdated: priceRef.lastUpdated,
        };
    }
    async findAll() {
        return this.prisma.flightPriceReference.findMany({
            orderBy: [
                { countryCode: 'asc' },
                { originCity: 'asc' },
                { lastUpdated: 'desc' },
            ],
        });
    }
    async findOne(id) {
        return this.prisma.flightPriceReference.findUnique({
            where: { id },
        });
    }
    async create(data) {
        const averagePrice = Math.round((data.lowSeasonPrice + data.highSeasonPrice) / 2);
        return this.prisma.flightPriceReference.create({
            data: {
                countryCode: data.countryCode.toUpperCase(),
                originCity: data.originCity ? data.originCity.toUpperCase() : null,
                lowSeasonPrice: data.lowSeasonPrice,
                highSeasonPrice: data.highSeasonPrice,
                averagePrice: averagePrice,
                visaCost: data.visaCost || 0,
                source: data.source,
                notes: data.notes,
            },
        });
    }
    async update(id, data) {
        var _a, _b;
        const updateData = { ...data };
        if (data.lowSeasonPrice !== undefined || data.highSeasonPrice !== undefined) {
            const existing = await this.prisma.flightPriceReference.findUnique({
                where: { id },
            });
            if (existing) {
                const lowPrice = (_a = data.lowSeasonPrice) !== null && _a !== void 0 ? _a : existing.lowSeasonPrice;
                const highPrice = (_b = data.highSeasonPrice) !== null && _b !== void 0 ? _b : existing.highSeasonPrice;
                updateData.averagePrice = Math.round((lowPrice + highPrice) / 2);
            }
        }
        if (updateData.countryCode) {
            updateData.countryCode = updateData.countryCode.toUpperCase();
        }
        if (updateData.originCity !== undefined) {
            updateData.originCity = updateData.originCity
                ? updateData.originCity.toUpperCase()
                : null;
        }
        return this.prisma.flightPriceReference.update({
            where: { id },
            data: updateData,
        });
    }
    async remove(id) {
        return this.prisma.flightPriceReference.delete({
            where: { id },
        });
    }
};
exports.FlightPriceService = FlightPriceService;
exports.FlightPriceService = FlightPriceService = FlightPriceService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], FlightPriceService);
//# sourceMappingURL=flight-price.service.js.map