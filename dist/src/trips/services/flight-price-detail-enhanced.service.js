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
var FlightPriceDetailEnhancedService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlightPriceDetailEnhancedService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const client_1 = require("@prisma/client");
let FlightPriceDetailEnhancedService = FlightPriceDetailEnhancedService_1 = class FlightPriceDetailEnhancedService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(FlightPriceDetailEnhancedService_1.name);
    }
    async getDetailedPriceOptions(originCity, destinationCity, month, dayOfWeek) {
        this.logger.debug(`查询详细价格选项: ${originCity}->${destinationCity}, 月份: ${month}, 星期: ${dayOfWeek}`);
        let dayOfWeekCondition = '';
        if (dayOfWeek !== undefined) {
            const pgDow = dayOfWeek === 6 ? 0 : dayOfWeek + 1;
            dayOfWeekCondition = `AND EXTRACT(DOW FROM "日期") = ${pgDow}`;
        }
        const airlineStats = await this.prisma.$queryRaw `
      SELECT 
        "航空公司" as airline,
        AVG("价格元")::FLOAT as avg_price,
        MIN("价格元")::FLOAT as min_price,
        MAX("价格元")::FLOAT as max_price,
        COUNT(*)::BIGINT as sample_count
      FROM "RawFlightData"
      WHERE 
        "出发城市" = ${originCity}
        AND "到达城市" = ${destinationCity}
        AND EXTRACT(MONTH FROM "日期") = ${month}
        AND "价格元" > 0 
        AND "价格元" < 100000
        AND "航空公司" IS NOT NULL 
        AND "航空公司" != ''
        ${dayOfWeekCondition ? client_1.Prisma.raw(dayOfWeekCondition) : client_1.Prisma.empty}
      GROUP BY "航空公司"
      ORDER BY avg_price ASC
    `;
        const airlineTimeSlots = await Promise.all(airlineStats.map(async (airline) => {
            const timeSlots = await this.prisma.$queryRaw `
          SELECT 
            CASE 
              WHEN EXTRACT(HOUR FROM "起飞时间"::TIME) >= 0 AND EXTRACT(HOUR FROM "起飞时间"::TIME) < 6 THEN '00:00-06:00'
              WHEN EXTRACT(HOUR FROM "起飞时间"::TIME) >= 6 AND EXTRACT(HOUR FROM "起飞时间"::TIME) < 12 THEN '06:00-12:00'
              WHEN EXTRACT(HOUR FROM "起飞时间"::TIME) >= 12 AND EXTRACT(HOUR FROM "起飞时间"::TIME) < 18 THEN '12:00-18:00'
              ELSE '18:00-24:00'
            END as time_slot,
            AVG("价格元")::FLOAT as avg_price,
            COUNT(*)::BIGINT as sample_count
          FROM "RawFlightData"
          WHERE 
            "出发城市" = ${originCity}
            AND "到达城市" = ${destinationCity}
            AND EXTRACT(MONTH FROM "日期") = ${month}
            AND "航空公司" = ${airline.airline}
            AND "价格元" > 0 
            AND "价格元" < 100000
            AND "起飞时间" IS NOT NULL
            ${dayOfWeekCondition ? client_1.Prisma.raw(dayOfWeekCondition) : client_1.Prisma.empty}
          GROUP BY time_slot
          ORDER BY avg_price ASC
        `;
            return {
                airline: airline.airline,
                avgPrice: Math.round(airline.avg_price),
                minPrice: Math.round(airline.min_price),
                maxPrice: Math.round(airline.max_price),
                sampleCount: Number(airline.sample_count),
                departureTimes: timeSlots.map(ts => ({
                    timeSlot: ts.time_slot,
                    avgPrice: Math.round(ts.avg_price),
                    sampleCount: Number(ts.sample_count),
                })),
            };
        }));
        const timeSlotStats = await this.prisma.$queryRaw `
      SELECT 
        CASE 
          WHEN EXTRACT(HOUR FROM "起飞时间"::TIME) >= 0 AND EXTRACT(HOUR FROM "起飞时间"::TIME) < 6 THEN '00:00-06:00'
          WHEN EXTRACT(HOUR FROM "起飞时间"::TIME) >= 6 AND EXTRACT(HOUR FROM "起飞时间"::TIME) < 12 THEN '06:00-12:00'
          WHEN EXTRACT(HOUR FROM "起飞时间"::TIME) >= 12 AND EXTRACT(HOUR FROM "起飞时间"::TIME) < 18 THEN '12:00-18:00'
          ELSE '18:00-24:00'
        END as time_slot,
        AVG("价格元")::FLOAT as avg_price,
        MIN("价格元")::FLOAT as min_price,
        MAX("价格元")::FLOAT as max_price,
        COUNT(*)::BIGINT as sample_count,
        STRING_AGG(DISTINCT "航空公司", ', ' ORDER BY "航空公司") as airlines
      FROM "RawFlightData"
      WHERE 
        "出发城市" = ${originCity}
        AND "到达城市" = ${destinationCity}
        AND EXTRACT(MONTH FROM "日期") = ${month}
        AND "价格元" > 0 
        AND "价格元" < 100000
        AND "起飞时间" IS NOT NULL
        ${dayOfWeekCondition ? client_1.Prisma.raw(dayOfWeekCondition) : client_1.Prisma.empty}
      GROUP BY time_slot
      ORDER BY avg_price ASC
    `;
        return {
            airlines: airlineTimeSlots,
            timeSlots: timeSlotStats.map(ts => ({
                timeSlot: ts.time_slot,
                avgPrice: Math.round(ts.avg_price),
                minPrice: Math.round(ts.min_price),
                maxPrice: Math.round(ts.max_price),
                sampleCount: Number(ts.sample_count),
                airlines: ts.airlines ? ts.airlines.split(', ') : [],
            })),
        };
    }
};
exports.FlightPriceDetailEnhancedService = FlightPriceDetailEnhancedService;
exports.FlightPriceDetailEnhancedService = FlightPriceDetailEnhancedService = FlightPriceDetailEnhancedService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], FlightPriceDetailEnhancedService);
//# sourceMappingURL=flight-price-detail-enhanced.service.js.map