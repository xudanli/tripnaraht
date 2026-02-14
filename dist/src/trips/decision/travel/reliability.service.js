"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TravelReliabilityService = exports.DEFAULT_RELIABILITY_CONFIG = void 0;
const common_1 = require("@nestjs/common");
exports.DEFAULT_RELIABILITY_CONFIG = {
    bufferByReliability: {
        high: 1.1,
        medium: 1.3,
        low: 1.5,
    },
    fixedBufferMin: 10,
};
let TravelReliabilityService = class TravelReliabilityService {
    enhanceReliability(leg, config = exports.DEFAULT_RELIABILITY_CONFIG) {
        const reliability = this.assessReliability(leg);
        const confidence = this.reliabilityToConfidence(reliability);
        const worstCaseDurationMin = this.calculateWorstCase(leg, reliability, config);
        return {
            ...leg,
            reliability,
            worstCaseDurationMin,
            confidence,
        };
    }
    assessReliability(leg) {
        if (leg.reliability !== undefined) {
            return leg.reliability;
        }
        switch (leg.source) {
            case 'google_routes':
            case 'smart_routes':
                return 0.9;
            case 'osrm':
                return 0.85;
            case 'heuristic':
                return 0.5;
            default:
                return 0.6;
        }
    }
    reliabilityToConfidence(reliability) {
        if (reliability >= 0.8)
            return 'high';
        if (reliability >= 0.5)
            return 'medium';
        return 'low';
    }
    calculateWorstCase(leg, reliability, config) {
        const baseDuration = leg.durationMin;
        const confidence = this.reliabilityToConfidence(reliability);
        const bufferMultiplier = config.bufferByReliability[confidence];
        return Math.round(baseDuration * bufferMultiplier + config.fixedBufferMin);
    }
    getRecommendedBuffer(leg, config = exports.DEFAULT_RELIABILITY_CONFIG) {
        const reliability = this.assessReliability(leg);
        const confidence = this.reliabilityToConfidence(reliability);
        const bufferMultiplier = config.bufferByReliability[confidence];
        return Math.round(leg.durationMin * (bufferMultiplier - 1) + config.fixedBufferMin);
    }
};
exports.TravelReliabilityService = TravelReliabilityService;
exports.TravelReliabilityService = TravelReliabilityService = __decorate([
    (0, common_1.Injectable)()
], TravelReliabilityService);
//# sourceMappingURL=reliability.service.js.map