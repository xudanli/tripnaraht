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
var FlightPriceDetailService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlightPriceDetailService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let FlightPriceDetailService = FlightPriceDetailService_1 = class FlightPriceDetailService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(FlightPriceDetailService_1.name);
    }
    async estimateDomesticPrice(originCity, destinationCity, month, dayOfWeek) {
        const routeId = `${originCity}->${destinationCity}`;
        this.logger.debug(`查询航线: ${routeId}, 月份: ${month}, 星期: ${dayOfWeek}`);
        this.logger.debug(`routeId 长度: ${routeId.length}, 编码: ${Buffer.from(routeId).toString('hex')}`);
        if (dayOfWeek !== undefined) {
            const dayData = await this.prisma.flightPriceDetail.findFirst({
                where: {
                    routeId,
                    month,
                    dayOfWeek,
                },
                select: {
                    id: true,
                    routeId: true,
                    originCity: true,
                    destinationCity: true,
                    month: true,
                    dayOfWeek: true,
                    monthlyBasePrice: true,
                    dayOfWeekFactor: true,
                    sampleCount: true,
                    distanceKm: true,
                    monthFactor: true,
                    airlineCount: true,
                    isWeekend: true,
                    departureTime: true,
                    arrivalTime: true,
                    timeOfDayFactor: true,
                },
            });
            this.logger.debug(`查询结果: ${dayData ? `找到数据 (ID: ${dayData.id}, 基准价: ${dayData.monthlyBasePrice})` : '未找到数据'}`);
            if (!dayData) {
                const allMonthData = await this.prisma.flightPriceDetail.findMany({
                    where: {
                        routeId,
                        month,
                    },
                });
                this.logger.debug(`该月份所有数据数量: ${allMonthData.length}`);
                if (allMonthData.length > 0) {
                    const availableDayOfWeeks = allMonthData
                        .map(d => d.dayOfWeek)
                        .filter((dow) => dow !== null)
                        .sort((a, b) => a - b);
                    const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
                    const dayOfWeekNames = availableDayOfWeeks.map(dow => `${dow}(${dayNames[dow]})`).join(', ');
                    this.logger.debug(`可用的星期值: [${dayOfWeekNames}] (请求的是: ${dayOfWeek}(${dayNames[dayOfWeek] || '未知'}))`);
                }
            }
            if (dayData) {
                const dayOfWeekFactor = dayData.dayOfWeekFactor || 1.0;
                const estimatedPrice = Math.round(dayData.monthlyBasePrice * dayOfWeekFactor);
                const lowerBound = Math.round(estimatedPrice * 0.9);
                const upperBound = Math.round(estimatedPrice * 1.1);
                return {
                    estimatedPrice,
                    lowerBound,
                    upperBound,
                    monthlyBasePrice: dayData.monthlyBasePrice,
                    dayOfWeekFactor,
                    sampleCount: dayData.sampleCount,
                    distanceKm: dayData.distanceKm,
                    monthFactor: dayData.monthFactor,
                    airlineCount: dayData.airlineCount,
                    isWeekend: dayData.isWeekend,
                    departureTime: dayData.departureTime,
                    arrivalTime: dayData.arrivalTime,
                    timeOfDayFactor: dayData.timeOfDayFactor,
                };
            }
            else {
                this.logger.warn(`未找到航线 ${routeId} 在 ${month} 月 ${dayOfWeek} 的数据，使用月度平均值`);
            }
        }
        const monthlyDataList = await this.prisma.flightPriceDetail.findMany({
            where: {
                routeId,
                month,
            },
            select: {
                id: true,
                routeId: true,
                originCity: true,
                destinationCity: true,
                month: true,
                dayOfWeek: true,
                monthlyBasePrice: true,
                dayOfWeekFactor: true,
                sampleCount: true,
                distanceKm: true,
                monthFactor: true,
                airlineCount: true,
                isWeekend: true,
                departureTime: true,
                arrivalTime: true,
                timeOfDayFactor: true,
            },
        });
        if (monthlyDataList.length === 0) {
            this.logger.warn(`未找到航线 ${routeId} 在 ${month} 月的数据，使用默认值`);
            return {
                estimatedPrice: 2000,
                lowerBound: 1800,
                upperBound: 2200,
                monthlyBasePrice: 2000,
                sampleCount: 0,
            };
        }
        const totalSamples = monthlyDataList.reduce((sum, d) => sum + d.sampleCount, 0);
        const weightedPrice = monthlyDataList.reduce((sum, d) => sum + d.monthlyBasePrice * d.sampleCount, 0) / totalSamples;
        const monthlyBasePrice = Math.round(weightedPrice);
        let dayOfWeekFactor;
        if (dayOfWeek !== undefined) {
            const globalFactor = await this.prisma.dayOfWeekFactor.findUnique({
                where: { dayOfWeek },
            });
            dayOfWeekFactor = (globalFactor === null || globalFactor === void 0 ? void 0 : globalFactor.factor) || 1.0;
        }
        const estimatedPrice = dayOfWeekFactor
            ? Math.round(monthlyBasePrice * dayOfWeekFactor)
            : monthlyBasePrice;
        const lowerBound = Math.round(estimatedPrice * 0.9);
        const upperBound = Math.round(estimatedPrice * 1.1);
        const firstRecord = monthlyDataList[0];
        return {
            estimatedPrice,
            lowerBound,
            upperBound,
            monthlyBasePrice,
            dayOfWeekFactor,
            sampleCount: totalSamples,
            distanceKm: firstRecord.distanceKm,
            monthFactor: firstRecord.monthFactor,
            airlineCount: firstRecord.airlineCount,
            isWeekend: firstRecord.isWeekend,
            departureTime: firstRecord.departureTime,
            arrivalTime: firstRecord.arrivalTime,
            timeOfDayFactor: firstRecord.timeOfDayFactor,
        };
    }
    async getDayOfWeekFactor(dayOfWeek) {
        const factor = await this.prisma.dayOfWeekFactor.findUnique({
            where: { dayOfWeek },
        });
        return (factor === null || factor === void 0 ? void 0 : factor.factor) || 1.0;
    }
    async getAllDayOfWeekFactors() {
        return this.prisma.dayOfWeekFactor.findMany({
            orderBy: { dayOfWeek: 'asc' },
        });
    }
    async getMonthlyTrend(originCity, destinationCity) {
        const routeId = `${originCity}->${destinationCity}`;
        const allData = await this.prisma.flightPriceDetail.findMany({
            where: {
                routeId,
            },
        });
        if (allData.length === 0) {
            return [];
        }
        const monthlyMap = new Map();
        allData.forEach((d) => {
            const existing = monthlyMap.get(d.month);
            if (existing) {
                existing.totalPrice += d.monthlyBasePrice * d.sampleCount;
                existing.totalSamples += d.sampleCount;
            }
            else {
                monthlyMap.set(d.month, {
                    totalPrice: d.monthlyBasePrice * d.sampleCount,
                    totalSamples: d.sampleCount,
                });
            }
        });
        const result = Array.from(monthlyMap.entries())
            .map(([month, stats]) => ({
            month,
            basePrice: Math.round(stats.totalPrice / stats.totalSamples),
            sampleCount: stats.totalSamples,
        }))
            .sort((a, b) => a.month - b.month);
        return result;
    }
};
exports.FlightPriceDetailService = FlightPriceDetailService;
exports.FlightPriceDetailService = FlightPriceDetailService = FlightPriceDetailService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], FlightPriceDetailService);
//# sourceMappingURL=flight-price-detail.service.js.map