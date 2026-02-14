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
var IcelandComprehensiveService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IcelandComprehensiveService = void 0;
const common_1 = require("@nestjs/common");
const data_source_router_service_1 = require("./data-source-router.service");
const iceland_safety_adapter_1 = require("../adapters/iceland-safety.adapter");
const iceland_froad_service_1 = require("./iceland-froad.service");
const iceland_aurora_adapter_1 = require("../adapters/iceland-aurora.adapter");
const risk_calculator_util_1 = require("../../common/utils/risk-calculator.util");
let IcelandComprehensiveService = IcelandComprehensiveService_1 = class IcelandComprehensiveService {
    constructor(router, safetyAdapter, fRoadService, auroraAdapter) {
        this.router = router;
        this.safetyAdapter = safetyAdapter;
        this.fRoadService = fRoadService;
        this.auroraAdapter = auroraAdapter;
        this.logger = new common_1.Logger(IcelandComprehensiveService_1.name);
    }
    async getComprehensiveRoadStatus(query) {
        const roadQuery = {
            ...query,
            includeFRoadInfo: true,
            includeRiverCrossing: true,
        };
        const status = await this.router.getRoadStatus(roadQuery);
        return status;
    }
    async getComprehensiveWeather(query) {
        const weatherQuery = {
            ...query,
            includeWindDetails: true,
            includeAuroraInfo: true,
        };
        const weather = await this.router.getWeather(weatherQuery);
        return weather;
    }
    async getSafetyAlerts(lat, lng) {
        return this.safetyAdapter.getSafetyAlerts(lat, lng);
    }
    async getCriticalSafetyAlerts(lat, lng) {
        return this.safetyAdapter.getCriticalSafetyAlerts(lat, lng);
    }
    assessRouteRisk(routeSegments, vehicleType, insurance) {
        return this.fRoadService.assessRouteRisk(routeSegments, vehicleType, insurance);
    }
    isVehicleSuitableForRoute(vehicleType, routeSegments) {
        return this.fRoadService.isVehicleSuitableForRoute(vehicleType, routeSegments);
    }
    async getAuroraVisibility(lat, lng) {
        return this.auroraAdapter.calculateAuroraVisibility(lat, lng);
    }
    async getAuroraForecast(lat, lng, hours = 24) {
        return this.auroraAdapter.getAuroraForecast(lat, lng, hours);
    }
    async getComprehensiveSafetyAssessment(lat, lng, routeSegments) {
        const [roadStatus, weather, safetyAlerts] = await Promise.all([
            this.getComprehensiveRoadStatus({ lat, lng, includeFRoadInfo: true, includeRiverCrossing: true }),
            this.getComprehensiveWeather({ lat, lng, includeWindDetails: true, includeAuroraInfo: true }),
            this.getCriticalSafetyAlerts(lat, lng),
        ]);
        let routeRisk;
        if (routeSegments && routeSegments.length > 0) {
            routeRisk = this.assessRouteRisk(routeSegments);
        }
        const overallRiskLevel = risk_calculator_util_1.RiskCalculator.maxRiskLevel(roadStatus.riskLevel, risk_calculator_util_1.RiskCalculator.calculateRiskFromAlerts(weather.alerts || []), risk_calculator_util_1.RiskCalculator.calculateRiskFromAlerts(safetyAlerts), routeRisk === null || routeRisk === void 0 ? void 0 : routeRisk.overallRiskLevel);
        const recommendations = [];
        if (roadStatus.riskLevel >= 2) {
            recommendations.push(`路况风险: ${roadStatus.reason || '请谨慎驾驶'}`);
        }
        if (roadStatus.fRoadInfo && roadStatus.fRoadInfo.requires4WD) {
            recommendations.push(`F-Road ${roadStatus.fRoadInfo.roadNumber} 需要 4WD 车辆`);
        }
        if (weather.windGust && weather.windGust > 25) {
            recommendations.push(`强风警告: 瞬时风速 ${weather.windGust} m/s，注意车门安全`);
        }
        if (weather.alerts && weather.alerts.length > 0) {
            recommendations.push(`天气警报: ${weather.alerts.map(a => a.title).join(', ')}`);
        }
        if (safetyAlerts.length > 0) {
            recommendations.push(`安全警报: ${safetyAlerts.map(a => a.title).join(', ')}`);
        }
        if (routeRisk && routeRisk.overallRiskLevel >= 2) {
            recommendations.push(...routeRisk.riskReasons);
            recommendations.push(...routeRisk.insuranceRecommendations);
        }
        return {
            roadStatus,
            weather,
            safetyAlerts,
            routeRisk,
            overallRiskLevel,
            recommendations,
        };
    }
};
exports.IcelandComprehensiveService = IcelandComprehensiveService;
exports.IcelandComprehensiveService = IcelandComprehensiveService = IcelandComprehensiveService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [data_source_router_service_1.DataSourceRouterService,
        iceland_safety_adapter_1.IcelandSafetyAdapter,
        iceland_froad_service_1.IcelandFRoadService,
        iceland_aurora_adapter_1.IcelandAuroraAdapter])
], IcelandComprehensiveService);
//# sourceMappingURL=iceland-comprehensive.service.js.map