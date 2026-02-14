"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var MoBagelForecastService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MoBagelForecastService = void 0;
const common_1 = require("@nestjs/common");
let MoBagelForecastService = MoBagelForecastService_1 = class MoBagelForecastService {
    constructor() {
        this.logger = new common_1.Logger(MoBagelForecastService_1.name);
    }
    async getPriceForecast(countryCode, month, routeDirectionId) {
        this.logger.warn('MoBagelForecastService.getPriceForecast 尚未实现，返回占位数据');
        return {
            countryCode,
            month,
            routeDirectionId,
            budgetRange: {
                min: 1000,
                max: 5000,
                median: 2500,
                percentile25: 1500,
                percentile75: 3500,
            },
            costBreakdown: {
                flight: { min: 500, max: 2000, median: 1000 },
                hotel: { min: 50, max: 200, median: 100 },
                carRental: { min: 30, max: 150, median: 70 },
            },
            confidence: 0.5,
            dataSource: 'MODEL_PREDICTION',
            metadata: {
                note: '这是占位实现，需要接入真实预测模型',
            },
        };
    }
    async getCrowdForecast(countryCode, month, regionId, poiId) {
        this.logger.warn('MoBagelForecastService.getCrowdForecast 尚未实现，返回占位数据');
        return {
            countryCode,
            month,
            regionId,
            poiId,
            crowdLevel: 'MEDIUM',
            crowdScore: 0.5,
            confidence: 0.5,
            metadata: {
                note: '这是占位实现，需要接入真实预测模型',
            },
        };
    }
    async getRouteRiskForecast(countryCode, month, routeDirectionId, segmentId) {
        this.logger.warn('MoBagelForecastService.getRouteRiskForecast 尚未实现，返回占位数据');
        return {
            countryCode,
            month,
            routeDirectionId,
            segmentId,
            closureProbability: 0.2,
            weatherRiskLevel: 'MEDIUM',
            weatherRiskScore: 0.4,
            riskItems: [],
            confidence: 0.5,
            metadata: {
                note: '这是占位实现，需要接入真实预测模型',
            },
        };
    }
    async getRouteAbandonmentForecast(routeDirectionId, userProfile) {
        this.logger.warn('MoBagelForecastService.getRouteAbandonmentForecast 尚未实现，返回占位数据');
        return {
            routeDirectionId,
            userProfile,
            abandonmentProbability: 0.1,
            predictedReasons: [],
            confidence: 0.5,
            metadata: {
                note: '这是占位实现，需要接入真实预测模型',
            },
        };
    }
    async getFatigueFailureForecast(routeDirectionId, humanCapability) {
        this.logger.warn('MoBagelForecastService.getFatigueFailureForecast 尚未实现，返回占位数据');
        return {
            routeDirectionId,
            humanCapability,
            failureProbability: 0.15,
            confidence: 0.5,
            metadata: {
                note: '这是占位实现，需要接入真实预测模型',
            },
        };
    }
};
exports.MoBagelForecastService = MoBagelForecastService;
exports.MoBagelForecastService = MoBagelForecastService = MoBagelForecastService_1 = __decorate([
    (0, common_1.Injectable)()
], MoBagelForecastService);
//# sourceMappingURL=mobagel-forecast.service.js.map