"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocationDetectorService = void 0;
const common_1 = require("@nestjs/common");
let LocationDetectorService = class LocationDetectorService {
    isInChina(lat, lng) {
        const chinaBounds = {
            minLat: 18.0,
            maxLat: 54.0,
            minLng: 73.0,
            maxLng: 135.0,
        };
        if (lat >= chinaBounds.minLat &&
            lat <= chinaBounds.maxLat &&
            lng >= chinaBounds.minLng &&
            lng <= chinaBounds.maxLng) {
            if (lng > 87 && lng < 120 && lat > 41 && lat < 52) {
                const distanceToChinaCenter = Math.sqrt(Math.pow(lat - 35, 2) + Math.pow(lng - 105, 2));
                const distanceToMongoliaCenter = Math.sqrt(Math.pow(lat - 46, 2) + Math.pow(lng - 105, 2));
                return distanceToChinaCenter < distanceToMongoliaCenter;
            }
            if (lng > 129 && lng < 146 && lat > 24 && lat < 46) {
                return false;
            }
            if (lng > 124 && lng < 132 && lat > 33 && lat < 39) {
                return false;
            }
            if (lng > 135 && lat > 50) {
                return false;
            }
            return true;
        }
        return false;
    }
    areBothInChina(fromLat, fromLng, toLat, toLng) {
        return (this.isInChina(fromLat, fromLng) && this.isInChina(toLat, toLng));
    }
    areBothOverseas(fromLat, fromLng, toLat, toLng) {
        return (!this.isInChina(fromLat, fromLng) && !this.isInChina(toLat, toLng));
    }
};
exports.LocationDetectorService = LocationDetectorService;
exports.LocationDetectorService = LocationDetectorService = __decorate([
    (0, common_1.Injectable)()
], LocationDetectorService);
//# sourceMappingURL=location-detector.service.js.map