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
var SmartRoutesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmartRoutesService = void 0;
const common_1 = require("@nestjs/common");
const google_routes_service_1 = require("./google-routes.service");
const amap_routes_service_1 = require("./amap-routes.service");
const location_detector_service_1 = require("./location-detector.service");
let SmartRoutesService = SmartRoutesService_1 = class SmartRoutesService {
    constructor(googleRoutesService, amapRoutesService, locationDetector) {
        this.googleRoutesService = googleRoutesService;
        this.amapRoutesService = amapRoutesService;
        this.locationDetector = locationDetector;
        this.logger = new common_1.Logger(SmartRoutesService_1.name);
    }
    async getRoutes(fromLat, fromLng, toLat, toLng, travelMode = 'TRANSIT', preferences) {
        const bothInChina = this.locationDetector.areBothInChina(fromLat, fromLng, toLat, toLng);
        const bothOverseas = this.locationDetector.areBothOverseas(fromLat, fromLng, toLat, toLng);
        if (!bothInChina && !bothOverseas) {
            this.logger.warn(`跨区域路线（中国↔海外），使用 Google Routes API`);
            return this.googleRoutesService.getRoutes(fromLat, fromLng, toLat, toLng, travelMode, preferences);
        }
        if (bothInChina) {
            this.logger.debug('使用高德地图 API（国内路线）');
            const amapMode = this.convertTravelModeToAmap(travelMode);
            const options = await this.amapRoutesService.getRoutes(fromLat, fromLng, toLat, toLng, amapMode, preferences);
            if (options.length === 0) {
                this.logger.warn('高德地图 API 无结果，降级使用 Google Routes API');
                return this.googleRoutesService.getRoutes(fromLat, fromLng, toLat, toLng, travelMode, preferences);
            }
            return options;
        }
        this.logger.debug('使用 Google Routes API（海外路线）');
        return this.googleRoutesService.getRoutes(fromLat, fromLng, toLat, toLng, travelMode, preferences);
    }
    convertTravelModeToAmap(mode) {
        switch (mode) {
            case 'TRANSIT':
                return 'transit';
            case 'WALKING':
                return 'walking';
            case 'DRIVING':
                return 'driving';
            default:
                return 'transit';
        }
    }
};
exports.SmartRoutesService = SmartRoutesService;
exports.SmartRoutesService = SmartRoutesService = SmartRoutesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [google_routes_service_1.GoogleRoutesService,
        amap_routes_service_1.AmapRoutesService,
        location_detector_service_1.LocationDetectorService])
], SmartRoutesService);
//# sourceMappingURL=smart-routes.service.js.map