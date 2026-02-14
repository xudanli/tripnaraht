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
var HotelPricePredictionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HotelPricePredictionService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const prophet_service_1 = require("../../flight-prices/services/prophet-service");
let HotelPricePredictionService = HotelPricePredictionService_1 = class HotelPricePredictionService {
    constructor(prisma, prophetService) {
        this.prisma = prisma;
        this.prophetService = prophetService;
        this.logger = new common_1.Logger(HotelPricePredictionService_1.name);
    }
    async predictHotelPrice(request) {
        var _a, _b, _c;
        this.logger.debug(`预测酒店价格: ${request.city}, ${request.star_level}星, 日期: ${request.check_in_date}`);
        const currentPrice = await this.getCurrentHotelPrice(request.city, request.star_level, request.check_in_date);
        const historicalData = await this.getHistoricalHotelPrices(request.city, request.star_level);
        const historicalTrend = this.calculateHistoricalTrend(historicalData);
        const forecast = await this.generateForecast(historicalData, request.check_in_date, 30);
        const buySignal = this.generateBuySignal(currentPrice || ((_a = forecast[0]) === null || _a === void 0 ? void 0 : _a.price) || historicalTrend.mean_price, historicalTrend.mean_price, ((_b = forecast[0]) === null || _b === void 0 ? void 0 : _b.price) || historicalTrend.mean_price);
        return {
            current_price: currentPrice || ((_c = forecast[0]) === null || _c === void 0 ? void 0 : _c.price) || historicalTrend.mean_price,
            buy_signal: buySignal,
            forecast,
            historical_trend: historicalTrend,
        };
    }
    async getCurrentHotelPrice(city, starLevel, date) {
        try {
            const realtimePrice = await this.getRealtimeHotelPrice(city, starLevel, date);
            if (realtimePrice !== null) {
                this.logger.debug(`从实时API获取价格: ${realtimePrice}`);
                return realtimePrice;
            }
        }
        catch (error) {
            this.logger.warn(`实时价格API获取失败: ${error.message}`);
        }
        try {
            const targetDate = new Date(date);
            const year = targetDate.getFullYear();
            const month = targetDate.getMonth() + 1;
            const quarter = Math.floor((month - 1) / 3) + 1;
            const quarterlyData = await this.prisma.hotelWideData_Quarterly.findFirst({
                where: {
                    city,
                    starRating: starLevel,
                },
            });
            if (quarterlyData) {
                const quarterField = `q${year}_Q${quarter}`;
                const quarterPrice = quarterlyData[quarterField];
                if (quarterPrice !== null && quarterPrice !== undefined) {
                    this.logger.debug(`从数据库获取季度价格: ${quarterPrice}`);
                    return Math.round(quarterPrice);
                }
            }
            const starCityPrice = await this.prisma.starCityPriceDetail.findUnique({
                where: {
                    city_starRating: {
                        city,
                        starRating: starLevel,
                    },
                },
            });
            if (starCityPrice && starCityPrice.avgPrice) {
                this.logger.debug(`从数据库获取基础价格: ${starCityPrice.avgPrice}`);
                return Math.round(starCityPrice.avgPrice);
            }
        }
        catch (error) {
            this.logger.warn(`数据库查询失败: ${error.message}`);
        }
        return null;
    }
    async getRealtimeHotelPrice(city, starLevel, date) {
        const apiProvider = process.env.REALTIME_HOTEL_API_PROVIDER;
        const apiKey = process.env.REALTIME_HOTEL_API_KEY;
        if (!apiProvider || !apiKey) {
            return null;
        }
        try {
            switch (apiProvider.toUpperCase()) {
                case 'AMADEUS':
                    return await this.getAmadeusHotelPrice(city, starLevel, date, apiKey);
                case 'BOOKING':
                    return await this.getBookingHotelPrice(city, starLevel, date, apiKey);
                default:
                    this.logger.warn(`不支持的实时价格API提供商: ${apiProvider}`);
                    return null;
            }
        }
        catch (error) {
            this.logger.error(`实时价格API调用失败: ${error.message}`);
            return null;
        }
    }
    async getAmadeusHotelPrice(city, starLevel, date, apiKey) {
        this.logger.debug('Amadeus Hotel API 调用（待实现）');
        return null;
    }
    async getBookingHotelPrice(city, starLevel, date, apiKey) {
        this.logger.debug('Booking.com API 调用（待实现）');
        return null;
    }
    async getHistoricalHotelPrices(city, starLevel) {
        this.logger.debug(`查询历史酒店价格数据: ${city}, ${starLevel}星`);
        const quarterlyData = await this.prisma.hotelWideData_Quarterly.findFirst({
            where: {
                city,
                starRating: starLevel,
            },
        });
        if (!quarterlyData) {
            this.logger.warn(`未找到 ${city} ${starLevel}星 的历史数据，使用模拟数据`);
            return this.generateMockHistoricalData(starLevel);
        }
        const historicalData = [];
        const today = new Date();
        const twoYearsAgo = new Date(today);
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
        for (let d = new Date(twoYearsAgo); d <= today; d.setDate(d.getDate() + 1)) {
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            const quarter = Math.floor((month - 1) / 3) + 1;
            const quarterField = `q${year}_Q${quarter}`;
            const quarterPrice = quarterlyData[quarterField];
            if (quarterPrice !== null && quarterPrice !== undefined) {
                const monthInQuarter = ((month - 1) % 3) + 1;
                const monthlyFactor = 0.95 + (monthInQuarter - 1) * 0.05;
                const price = Math.round(quarterPrice * monthlyFactor);
                historicalData.push({
                    date: d.toISOString().split('T')[0],
                    price,
                });
            }
        }
        if (historicalData.length < 30) {
            const starCityPrice = await this.prisma.starCityPriceDetail.findUnique({
                where: {
                    city_starRating: {
                        city,
                        starRating: starLevel,
                    },
                },
            });
            if (starCityPrice && starCityPrice.avgPrice) {
                const basePrice = starCityPrice.avgPrice;
                for (let d = new Date(twoYearsAgo); d <= today; d.setDate(d.getDate() + 1)) {
                    const month = d.getMonth() + 1;
                    const seasonalFactor = 1 + 0.2 * Math.sin((month - 1) * Math.PI / 6);
                    const price = Math.round(basePrice * seasonalFactor);
                    if (!historicalData.find((h) => h.date === d.toISOString().split('T')[0])) {
                        historicalData.push({
                            date: d.toISOString().split('T')[0],
                            price,
                        });
                    }
                }
            }
        }
        this.logger.debug(`生成历史价格数据: ${historicalData.length} 条`);
        return historicalData.sort((a, b) => a.date.localeCompare(b.date));
    }
    generateMockHistoricalData(starLevel) {
        const mockData = [];
        const today = new Date();
        for (let i = 730; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const basePrice = 300 * starLevel;
            const month = date.getMonth() + 1;
            const seasonalFactor = 1 + 0.3 * Math.sin((month - 1) * Math.PI / 6);
            const randomFactor = 0.85 + Math.random() * 0.3;
            const price = Math.round(basePrice * seasonalFactor * randomFactor);
            mockData.push({
                date: date.toISOString().split('T')[0],
                price,
            });
        }
        return mockData;
    }
    calculateHistoricalTrend(data) {
        if (data.length === 0) {
            return {
                mean_price: 0,
                min_price: 0,
                max_price: 0,
                std_price: 0,
                sample_count: 0,
            };
        }
        const prices = data.map((d) => d.price);
        const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
        const std = Math.sqrt(variance);
        return {
            mean_price: Math.round(mean),
            min_price: min,
            max_price: max,
            std_price: Math.round(std),
            sample_count: data.length,
        };
    }
    async generateForecast(historicalData, startDate, days) {
        try {
            const availability = await this.prophetService.checkAvailability();
            if (availability.available && historicalData.length >= 30) {
                this.logger.debug('使用 Prophet 模型进行预测');
                return await this.prophetService.predict(historicalData, startDate, days);
            }
            else {
                this.logger.debug(`降级到历史同期均值法: ${availability.message}`);
            }
        }
        catch (error) {
            this.logger.warn(`Prophet 预测失败，降级到历史同期均值法: ${error.message}`);
        }
        return this.generateForecastWithHistoricalMean(historicalData, startDate, days);
    }
    generateForecastWithHistoricalMean(historicalData, startDate, days) {
        const forecast = [];
        const start = new Date(startDate);
        for (let i = 0; i < days; i++) {
            const date = new Date(start);
            date.setDate(date.getDate() + i);
            const month = date.getMonth() + 1;
            const day = date.getDate();
            const sameMonthDayData = historicalData.filter((d) => {
                const dDate = new Date(d.date);
                return dDate.getMonth() + 1 === month && dDate.getDate() === day;
            });
            let predictedPrice;
            let lowerBound;
            let upperBound;
            let trend;
            if (sameMonthDayData.length > 0) {
                const prices = sameMonthDayData.map((d) => d.price);
                const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
                const std = Math.sqrt(prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length);
                predictedPrice = Math.round(mean);
                lowerBound = Math.round(mean - 1.96 * std);
                upperBound = Math.round(mean + 1.96 * std);
                const weekAgo = new Date(date);
                weekAgo.setDate(weekAgo.getDate() - 7);
                const weekAgoData = historicalData.filter((d) => {
                    const dDate = new Date(d.date);
                    return dDate.getMonth() + 1 === weekAgo.getMonth() + 1 &&
                        dDate.getDate() === weekAgo.getDate();
                });
                if (weekAgoData.length > 0) {
                    const weekAgoMean = weekAgoData.reduce((sum, d) => sum + d.price, 0) / weekAgoData.length;
                    if (mean > weekAgoMean * 1.05) {
                        trend = 'up';
                    }
                    else if (mean < weekAgoMean * 0.95) {
                        trend = 'down';
                    }
                    else {
                        trend = 'stable';
                    }
                }
                else {
                    trend = 'stable';
                }
            }
            else {
                const allPrices = historicalData.map((d) => d.price);
                const overallMean = allPrices.reduce((sum, p) => sum + p, 0) / allPrices.length;
                const overallStd = Math.sqrt(allPrices.reduce((sum, p) => sum + Math.pow(p - overallMean, 2), 0) / allPrices.length);
                predictedPrice = Math.round(overallMean);
                lowerBound = Math.round(overallMean - 1.96 * overallStd);
                upperBound = Math.round(overallMean + 1.96 * overallStd);
                trend = 'stable';
            }
            forecast.push({
                date: date.toISOString().split('T')[0],
                price: predictedPrice,
                lower_bound: Math.max(0, lowerBound),
                upper_bound: upperBound,
                trend,
                confidence: 0.8,
            });
        }
        return forecast;
    }
    generateBuySignal(currentPrice, historicalMean, predictedPrice) {
        const priceChangePercent = ((currentPrice - historicalMean) / historicalMean) * 100;
        let signal;
        let reason;
        let recommendation;
        if (priceChangePercent < -15) {
            signal = 'BUY';
            reason = `当前价格低于历史均值 ${Math.abs(Math.round(priceChangePercent))}%`;
            recommendation = '当前价格处于低位，建议立即预订';
        }
        else if (priceChangePercent > 15) {
            signal = 'WAIT';
            reason = `当前价格高于历史均值 ${Math.round(priceChangePercent)}%`;
            recommendation = '当前价格处于高位，建议观望等待';
        }
        else {
            signal = 'NEUTRAL';
            reason = `当前价格处于历史均值附近（${priceChangePercent > 0 ? '+' : ''}${Math.round(priceChangePercent)}%）`;
            recommendation = '当前价格处于正常范围，可根据行程安排决定';
        }
        return {
            signal,
            reason,
            current_price: currentPrice,
            historical_mean: historicalMean,
            predicted_price: predictedPrice,
            price_change_percent: Math.round(priceChangePercent * 100) / 100,
            recommendation,
        };
    }
};
exports.HotelPricePredictionService = HotelPricePredictionService;
exports.HotelPricePredictionService = HotelPricePredictionService = HotelPricePredictionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        prophet_service_1.ProphetService])
], HotelPricePredictionService);
//# sourceMappingURL=hotel-price-prediction.service.js.map