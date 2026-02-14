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
var HotelPriceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HotelPriceService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let HotelPriceService = HotelPriceService_1 = class HotelPriceService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(HotelPriceService_1.name);
    }
    async estimatePrice(city, starRating, year, quarter) {
        var _a, _b;
        this.logger.debug(`估算酒店价格: ${city}, ${starRating}星, ${year}年Q${quarter}`);
        const cityPrice = await this.prisma.hotelPriceDetail.findUnique({
            where: { city },
        });
        if (!cityPrice) {
            this.logger.warn(`未找到城市 ${city} 的基础价格数据，使用默认值`);
            return {
                estimatedPrice: 500,
                lowerBound: 400,
                upperBound: 600,
                basePrice: 500,
                cityStarFactor: 1.0,
                sampleCount: 0,
            };
        }
        const starPrice = await this.prisma.starCityPriceDetail.findUnique({
            where: {
                city_starRating: {
                    city,
                    starRating,
                },
            },
        });
        if (!starPrice) {
            this.logger.warn(`未找到 ${city} ${starRating}星 的质量因子，使用默认值`);
            const medianPrice = cityPrice.medianPrice || 500;
            const estimatedPrice = Math.round(medianPrice);
            return {
                estimatedPrice,
                lowerBound: Math.round(estimatedPrice * 0.8),
                upperBound: Math.round(estimatedPrice * 1.2),
                basePrice: medianPrice,
                cityStarFactor: 1.0,
                sampleCount: cityPrice.sampleCount,
            };
        }
        let quarterPrice;
        if (year && quarter) {
            const quarterField = `${year}_Q${quarter}`;
            try {
                const quarterlyData = await this.prisma.$queryRawUnsafe(`SELECT "${quarterField}"::FLOAT as price
           FROM "HotelWideData_Quarterly"
           WHERE city = $1
           AND "starRating" = $2
           AND "${quarterField}" IS NOT NULL
           LIMIT 1`, city, starRating);
                if (quarterlyData.length > 0 && quarterlyData[0].price !== null) {
                    quarterPrice = quarterlyData[0].price;
                }
            }
            catch (error) {
                this.logger.warn(`查询季度价格失败: ${year}年Q${quarter}`, error);
            }
        }
        const basePrice = quarterPrice || ((_a = cityPrice.medianPrice) !== null && _a !== void 0 ? _a : 500);
        const cityStarFactor = (_b = starPrice.cityStarFactor) !== null && _b !== void 0 ? _b : 1.0;
        const estimatedPrice = Math.round(basePrice * cityStarFactor);
        const lowerBound = Math.round(estimatedPrice * 0.8);
        const upperBound = Math.round(estimatedPrice * 1.2);
        return {
            estimatedPrice,
            lowerBound,
            upperBound,
            basePrice: basePrice !== null && basePrice !== void 0 ? basePrice : 500,
            cityStarFactor: cityStarFactor !== null && cityStarFactor !== void 0 ? cityStarFactor : 1.0,
            quarterPrice,
            sampleCount: starPrice.sampleCount,
        };
    }
    async getCityStarOptions(city) {
        const options = await this.prisma.starCityPriceDetail.findMany({
            where: { city },
            orderBy: { starRating: 'asc' },
            select: {
                starRating: true,
                avgPrice: true,
                cityStarFactor: true,
                sampleCount: true,
                minPrice: true,
                maxPrice: true,
            },
        });
        return options.map(opt => {
            var _a, _b;
            return ({
                starRating: opt.starRating,
                avgPrice: (_a = opt.avgPrice) !== null && _a !== void 0 ? _a : 0,
                cityStarFactor: (_b = opt.cityStarFactor) !== null && _b !== void 0 ? _b : 1.0,
                sampleCount: opt.sampleCount,
                minPrice: opt.minPrice,
                maxPrice: opt.maxPrice,
            });
        });
    }
    async getQuarterlyTrend(city, starRating) {
        const where = { city };
        if (starRating !== undefined) {
            where.starRating = starRating;
        }
        const data = await this.prisma.hotelWideData_Quarterly.findMany({
            where,
            select: {
                city: true,
                starRating: true,
                Q1_2018: true,
                Q2_2018: true,
                Q3_2018: true,
                Q4_2018: true,
                Q1_2019: true,
                Q2_2019: true,
                Q3_2019: true,
                Q4_2019: true,
                Q1_2020: true,
                Q2_2020: true,
                Q3_2020: true,
                Q4_2020: true,
                Q1_2021: true,
                Q2_2021: true,
                Q3_2021: true,
                Q4_2021: true,
                Q1_2022: true,
                Q2_2022: true,
                Q3_2022: true,
                Q4_2022: true,
                Q1_2023: true,
                Q2_2023: true,
                Q3_2023: true,
                Q4_2023: true,
                Q1_2024: true,
            },
        });
        const trend = [];
        data.forEach((row) => {
            const quarters = [
                { year: 2018, q: 1, field: 'Q1_2018' },
                { year: 2018, q: 2, field: 'Q2_2018' },
                { year: 2018, q: 3, field: 'Q3_2018' },
                { year: 2018, q: 4, field: 'Q4_2018' },
                { year: 2019, q: 1, field: 'Q1_2019' },
                { year: 2019, q: 2, field: 'Q2_2019' },
                { year: 2019, q: 3, field: 'Q3_2019' },
                { year: 2019, q: 4, field: 'Q4_2019' },
                { year: 2020, q: 1, field: 'Q1_2020' },
                { year: 2020, q: 2, field: 'Q2_2020' },
                { year: 2020, q: 3, field: 'Q3_2020' },
                { year: 2020, q: 4, field: 'Q4_2020' },
                { year: 2021, q: 1, field: 'Q1_2021' },
                { year: 2021, q: 2, field: 'Q2_2021' },
                { year: 2021, q: 3, field: 'Q3_2021' },
                { year: 2021, q: 4, field: 'Q4_2021' },
                { year: 2022, q: 1, field: 'Q1_2022' },
                { year: 2022, q: 2, field: 'Q2_2022' },
                { year: 2022, q: 3, field: 'Q3_2022' },
                { year: 2022, q: 4, field: 'Q4_2022' },
                { year: 2023, q: 1, field: 'Q1_2023' },
                { year: 2023, q: 2, field: 'Q2_2023' },
                { year: 2023, q: 3, field: 'Q3_2023' },
                { year: 2023, q: 4, field: 'Q4_2023' },
                { year: 2024, q: 1, field: 'Q1_2024' },
            ];
            quarters.forEach(({ year, q, field }) => {
                const price = row[field];
                if (price !== null && price > 0) {
                    trend.push({ year, quarter: q, price });
                }
            });
        });
        if (starRating !== undefined) {
            const grouped = new Map();
            trend.forEach(({ year, quarter, price }) => {
                const key = `${year}_Q${quarter}`;
                const existing = grouped.get(key);
                if (existing) {
                    existing.total += price;
                    existing.count += 1;
                }
                else {
                    grouped.set(key, { total: price, count: 1 });
                }
            });
            return Array.from(grouped.entries())
                .map(([key, stats]) => {
                const [year, quarter] = key.split('_Q');
                return {
                    year: parseInt(year),
                    quarter: parseInt(quarter),
                    price: Math.round(stats.total / stats.count),
                };
            })
                .sort((a, b) => {
                if (a.year !== b.year)
                    return a.year - b.year;
                return a.quarter - b.quarter;
            });
        }
        return trend.sort((a, b) => {
            if (a.year !== b.year)
                return a.year - b.year;
            return a.quarter - b.quarter;
        });
    }
    async recommendHotels(city, starRating, minPrice, maxPrice, limit = 10) {
        this.logger.debug(`推荐酒店: ${city}, ${starRating}星, 价格范围: ${minPrice}-${maxPrice}`);
        const cityName = city.replace('市', '');
        const cityWithSuffix = city.endsWith('市') ? city : `${city}市`;
        const hotels = await this.prisma.rawHotelData_Slim.findMany({
            where: {
                OR: [
                    { city: { equals: city } },
                    { city: { equals: cityWithSuffix } },
                    { city: { equals: cityName } },
                    { city: { contains: cityName } },
                ],
            },
            take: limit * 5,
        });
        this.logger.debug(`查询到 ${hotels.length} 家酒店（城市: ${city}）`);
        const brandStarMap = {
            '希尔顿': 5,
            'Hilton': 5,
            '华尔道夫': 5,
            'Waldorf Astoria': 5,
            '康莱德': 5,
            'Conrad': 5,
            '希尔顿嘉悦里': 5,
            'Canopy by Hilton': 5,
            '万豪': 5,
            'JW万豪': 5,
            'JW Marriott': 5,
            '喜来登': 5,
            'Sheraton': 5,
            '洲际': 5,
            'InterContinental': 5,
            '丽思卡尔顿': 5,
            'Ritz-Carlton': 5,
            '四季': 5,
            'Four Seasons': 5,
            '凯悦': 5,
            'Hyatt': 5,
            '香格里拉': 5,
            'Shangri-La': 5,
            '瑞吉': 5,
            'St. Regis': 5,
            'W酒店': 5,
            'W Hotels': 5,
            '威斯汀': 5,
            'Westin': 5,
            '万丽': 5,
            'Renaissance': 5,
            '万豪行政公寓': 5,
            'Marriott Executive Apartments': 5,
            '皇冠假日': 4,
            'Crowne Plaza': 4,
            '假日': 4,
            'Holiday Inn': 4,
            '智选假日': 4,
            'Holiday Inn Express': 4,
            '万怡': 4,
            'Courtyard': 4,
            '万枫': 4,
            'Fairfield': 4,
            '希尔顿花园': 4,
            'Hilton Garden Inn': 4,
            '希尔顿逸林': 4,
            'DoubleTree by Hilton': 4,
            '希尔顿格芮': 4,
            'Curio Collection by Hilton': 4,
            '希尔顿欢朋': 4,
            'Hampton by Hilton': 4,
            '希尔顿惠庭': 4,
            'Home2 Suites by Hilton': 4,
            '福朋': 4,
            'Four Points': 4,
            '雅高': 4,
            'Accor': 4,
            '诺富特': 4,
            'Novotel': 4,
            '美居': 4,
            'Mercure': 4,
            '桔子': 4,
            '全季': 4,
            '亚朵': 4,
            '如家': 3,
            '汉庭': 3,
            '锦江': 3,
            '7天': 2,
        };
        const filteredHotels = hotels
            .map((hotel) => {
            let inferredStar = 0;
            if (hotel.brand) {
                for (const [brand, star] of Object.entries(brandStarMap)) {
                    if (hotel.brand.includes(brand)) {
                        inferredStar = star;
                        break;
                    }
                }
            }
            return {
                hotel,
                inferredStar,
            };
        })
            .filter((item) => {
            if (item.inferredStar === 0) {
                return true;
            }
            return item.inferredStar === starRating;
        })
            .slice(0, limit)
            .map((item) => ({
            id: item.hotel.id,
            name: item.hotel.name || '未知酒店',
            brand: item.hotel.brand,
            address: item.hotel.address,
            district: item.hotel.district,
            lat: item.hotel.lat,
            lng: item.hotel.lng,
            phone: item.hotel.phone,
        }));
        this.logger.debug(`找到 ${filteredHotels.length} 家推荐酒店（筛选前: ${hotels.length} 家）`);
        if (filteredHotels.length === 0 && hotels.length > 0) {
            const brands = Array.from(new Set(hotels.map(h => h.brand).filter((b) => b !== null)));
            this.logger.warn(`未找到匹配 ${starRating} 星级的酒店，但找到了 ${hotels.length} 家酒店。品牌分布: ${brands.join(', ')}`);
        }
        return filteredHotels;
    }
    async estimatePriceWithRecommendations(city, starRating, year, quarter, includeRecommendations = false, recommendationLimit = 5) {
        const priceEstimate = await this.estimatePrice(city, starRating, year, quarter);
        const result = { ...priceEstimate };
        if (includeRecommendations) {
            const recommendations = await this.recommendHotels(city, starRating, priceEstimate.lowerBound, priceEstimate.upperBound, recommendationLimit);
            result.recommendations = recommendations;
        }
        return result;
    }
};
exports.HotelPriceService = HotelPriceService;
exports.HotelPriceService = HotelPriceService = HotelPriceService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], HotelPriceService);
//# sourceMappingURL=hotel-price.service.js.map