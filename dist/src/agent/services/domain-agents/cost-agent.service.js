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
var CostAgentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CostAgentService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let CostAgentService = CostAgentService_1 = class CostAgentService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(CostAgentService_1.name);
        this.basePrices = {
            IS: { accommodation: 180, dining: 80, activities: 100 },
            JP: { accommodation: 120, dining: 50, activities: 60 },
            CH: { accommodation: 200, dining: 100, activities: 80 },
            NP: { accommodation: 40, dining: 20, activities: 50 },
            DEFAULT: { accommodation: 100, dining: 50, activities: 50 },
        };
        this.logger.log('[CostAgent] Initialized');
    }
    async estimateTripCost(destination, dateRange, travelers, preferences) {
        const evidence = [];
        const countryCode = this.extractCountryCode(destination);
        const basePrices = this.basePrices[countryCode] || this.basePrices['DEFAULT'];
        const startDate = new Date(dateRange.start);
        const endDate = new Date(dateRange.end);
        const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const nights = days - 1;
        const accomMultiplier = (preferences === null || preferences === void 0 ? void 0 : preferences.accommodation_level) === 'LUXURY' ? 2.5 :
            (preferences === null || preferences === void 0 ? void 0 : preferences.accommodation_level) === 'MID_RANGE' ? 1.5 : 1;
        const diningMultiplier = (preferences === null || preferences === void 0 ? void 0 : preferences.dining_level) === 'FINE_DINING' ? 2.0 :
            (preferences === null || preferences === void 0 ? void 0 : preferences.dining_level) === 'MID_RANGE' ? 1.3 : 1;
        const seasonMultiplier = this.getSeasonMultiplier(startDate, countryCode);
        const accommodation = Math.round(basePrices.accommodation * nights * accomMultiplier * seasonMultiplier);
        const dining = Math.round(basePrices.dining * days * diningMultiplier * travelers);
        const activities = Math.round(basePrices.activities * days * travelers);
        const transport = Math.round(days * 50 * (travelers > 2 ? 1.3 : 1));
        const other = Math.round((accommodation + dining + activities + transport) * 0.1);
        const expected = accommodation + dining + activities + transport + other;
        const optimistic = Math.round(expected * 0.8);
        const pessimistic = Math.round(expected * 1.3);
        evidence.push({
            evidence_id: `cost_estimate_${Date.now()}`,
            source: 'CostAgent.estimateTripCost',
            timestamp: new Date().toISOString(),
            data: {
                destination,
                country_code: countryCode,
                days,
                nights,
                travelers,
                preferences,
                season_multiplier: seasonMultiplier,
            },
        });
        return {
            total_estimate: {
                optimistic,
                expected,
                pessimistic,
                currency: 'USD',
            },
            breakdown: {
                accommodation,
                transport,
                activities,
                dining,
                other,
            },
            confidence: 0.7,
            evidence,
            data_quality: this.createDataQuality({
                sourceType: 'HISTORICAL',
                confidence: 0.7,
                coverage: 1.0,
            }),
        };
    }
    async analyzePriceCurve(service, destination, dateRange) {
        const evidence = [];
        const countryCode = this.extractCountryCode(destination);
        const priceTrend = [];
        const peakPeriods = [];
        const startDate = new Date(dateRange.start);
        const endDate = new Date(dateRange.end);
        const basePrice = service === 'FLIGHT' ? 500 : service === 'HOTEL' ? 150 : 80;
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const seasonMult = this.getSeasonMultiplier(d, countryCode);
            const weekendMult = [0, 5, 6].includes(d.getDay()) ? 1.15 : 1;
            const price = Math.round(basePrice * seasonMult * weekendMult);
            priceTrend.push({ date: dateStr, price });
        }
        if (countryCode === 'IS') {
            peakPeriods.push({ start: `${startDate.getFullYear()}-06-15`, end: `${startDate.getFullYear()}-08-31`, multiplier: 1.8 }, { start: `${startDate.getFullYear()}-12-20`, end: `${startDate.getFullYear() + 1}-01-05`, multiplier: 1.5 });
        }
        const now = new Date();
        const daysUntilTrip = Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const optimalStart = new Date(now.getTime() + Math.max(0, daysUntilTrip - 60) * 24 * 60 * 60 * 1000);
        const optimalEnd = new Date(now.getTime() + Math.max(0, daysUntilTrip - 21) * 24 * 60 * 60 * 1000);
        evidence.push({
            evidence_id: `price_curve_${Date.now()}`,
            source: 'CostAgent.analyzePriceCurve',
            timestamp: new Date().toISOString(),
            data: { service, destination, country_code: countryCode, days_analyzed: priceTrend.length },
        });
        return {
            price_trend: priceTrend,
            peak_periods: peakPeriods,
            optimal_booking_window: {
                start: optimalStart.toISOString().split('T')[0],
                end: optimalEnd.toISOString().split('T')[0],
            },
            expected_saving_percent: daysUntilTrip > 60 ? 20 : daysUntilTrip > 30 ? 10 : 0,
            evidence,
            data_quality: this.createDataQuality({
                sourceType: 'HISTORICAL',
                confidence: 0.65,
                coverage: 1.0,
            }),
        };
    }
    async optimizeBudget(totalBudget, requirements) {
        const evidence = [];
        const countryCode = this.extractCountryCode(requirements.destination);
        const basePrices = this.basePrices[countryCode] || this.basePrices['DEFAULT'];
        const minRequired = (basePrices.accommodation * (requirements.days - 1)) +
            (basePrices.dining * requirements.days * requirements.travelers) +
            (basePrices.activities * requirements.days * requirements.travelers * 0.5) +
            (50 * requirements.days);
        const feasibility = totalBudget >= minRequired * 1.5 ? 'COMFORTABLE' :
            totalBudget >= minRequired ? 'TIGHT' : 'INSUFFICIENT';
        const accomPct = 0.35;
        const transportPct = 0.20;
        const activitiesPct = 0.20;
        const diningPct = 0.15;
        const bufferPct = 0.10;
        const allocation = {
            accommodation: { amount: Math.round(totalBudget * accomPct), percentage: accomPct * 100 },
            transport: { amount: Math.round(totalBudget * transportPct), percentage: transportPct * 100 },
            activities: { amount: Math.round(totalBudget * activitiesPct), percentage: activitiesPct * 100 },
            dining: { amount: Math.round(totalBudget * diningPct), percentage: diningPct * 100 },
            buffer: { amount: Math.round(totalBudget * bufferPct), percentage: bufferPct * 100 },
        };
        const savingOpportunities = [];
        if (feasibility === 'TIGHT' || feasibility === 'INSUFFICIENT') {
            savingOpportunities.push({
                category: 'Accommodation',
                suggestion: 'Consider hostels or guesthouses',
                potential_saving: Math.round(allocation.accommodation.amount * 0.3),
                tradeoff: 'Less privacy, shared facilities',
            }, {
                category: 'Dining',
                suggestion: 'Cook some meals, visit local markets',
                potential_saving: Math.round(allocation.dining.amount * 0.4),
                tradeoff: 'Time spent cooking, less local cuisine experience',
            }, {
                category: 'Activities',
                suggestion: 'Focus on free/low-cost natural attractions',
                potential_saving: Math.round(allocation.activities.amount * 0.5),
                tradeoff: 'May miss some paid attractions',
            });
        }
        evidence.push({
            evidence_id: `budget_opt_${Date.now()}`,
            source: 'CostAgent.optimizeBudget',
            timestamp: new Date().toISOString(),
            data: {
                total_budget: totalBudget,
                requirements,
                min_required: minRequired,
                feasibility,
            },
        });
        return {
            recommended_allocation: allocation,
            feasibility,
            saving_opportunities: savingOpportunities,
            evidence,
            data_quality: this.createDataQuality({
                sourceType: 'ESTIMATED',
                confidence: 0.6,
                coverage: 1.0,
            }),
        };
    }
    extractCountryCode(destination) {
        const countryMap = {
            'iceland': 'IS', 'IS': 'IS',
            'japan': 'JP', 'JP': 'JP',
            'switzerland': 'CH', 'CH': 'CH',
            'nepal': 'NP', 'NP': 'NP',
        };
        const lower = destination.toLowerCase();
        for (const [key, code] of Object.entries(countryMap)) {
            if (lower.includes(key.toLowerCase()))
                return code;
        }
        return 'DEFAULT';
    }
    getSeasonMultiplier(date, countryCode) {
        const month = date.getMonth() + 1;
        if (countryCode === 'IS') {
            if (month >= 6 && month <= 8)
                return 1.8;
            if (month === 12 || month === 1)
                return 1.4;
            return 1.0;
        }
        if (countryCode === 'JP') {
            if (month >= 3 && month <= 5)
                return 1.5;
            if (month >= 10 && month <= 11)
                return 1.3;
            return 1.0;
        }
        if (countryCode === 'CH') {
            if (month >= 12 || month <= 2)
                return 1.6;
            if (month >= 6 && month <= 8)
                return 1.4;
            return 1.0;
        }
        return 1.0;
    }
    createDataQuality(options) {
        const now = new Date().toISOString();
        return {
            source_type: options.sourceType,
            freshness_seconds: 0,
            confidence: options.confidence,
            coverage: options.coverage,
            retrieved_at: now,
            expires_at: new Date(Date.now() + 86400000).toISOString(),
            fallback_info: options.fallbackInfo,
        };
    }
};
exports.CostAgentService = CostAgentService;
exports.CostAgentService = CostAgentService = CostAgentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CostAgentService);
//# sourceMappingURL=cost-agent.service.js.map