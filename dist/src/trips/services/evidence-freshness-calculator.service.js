"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var EvidenceFreshnessCalculator_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvidenceFreshnessCalculator = void 0;
const common_1 = require("@nestjs/common");
const evidence_dto_1 = require("../dto/evidence.dto");
let EvidenceFreshnessCalculator = EvidenceFreshnessCalculator_1 = class EvidenceFreshnessCalculator {
    constructor() {
        this.logger = new common_1.Logger(EvidenceFreshnessCalculator_1.name);
        this.TTL_MAP = {
            [evidence_dto_1.EvidenceType.WEATHER]: 1800,
            [evidence_dto_1.EvidenceType.ROAD_CLOSURE]: 3600,
            [evidence_dto_1.EvidenceType.OPENING_HOURS]: 86400,
            [evidence_dto_1.EvidenceType.BOOKING]: 3600,
            [evidence_dto_1.EvidenceType.OTHER]: 86400,
        };
    }
    calculateFreshness(item, place) {
        const timestamp = this.extractTimestamp(item, place);
        if (!timestamp) {
            return undefined;
        }
        const ttl = this.getTTLForEvidenceType(item.type);
        const expiresAt = new Date(timestamp.getTime() + ttl * 1000);
        const now = new Date();
        let freshnessStatus;
        if (now > expiresAt) {
            freshnessStatus = evidence_dto_1.EvidenceFreshnessStatus.EXPIRED;
        }
        else {
            const staleThreshold = new Date(expiresAt.getTime() - 0.5 * ttl * 1000);
            if (now > staleThreshold) {
                freshnessStatus = evidence_dto_1.EvidenceFreshnessStatus.STALE;
            }
            else {
                freshnessStatus = evidence_dto_1.EvidenceFreshnessStatus.FRESH;
            }
        }
        return {
            fetchedAt: timestamp.toISOString(),
            expiresAt: expiresAt.toISOString(),
            freshnessStatus,
            recommendedRefreshAt: expiresAt.toISOString(),
        };
    }
    extractTimestamp(item, place) {
        var _a, _b, _c;
        if (place) {
            const metadata = place.metadata;
            if (item.type === evidence_dto_1.EvidenceType.WEATHER) {
                const weatherFetchedAt = (metadata === null || metadata === void 0 ? void 0 : metadata.weatherFetchedAt) || ((_a = metadata === null || metadata === void 0 ? void 0 : metadata.weatherInfo) === null || _a === void 0 ? void 0 : _a.fetchedAt);
                if (weatherFetchedAt) {
                    return new Date(weatherFetchedAt);
                }
            }
            else if (item.type === evidence_dto_1.EvidenceType.ROAD_CLOSURE) {
                const roadStatusFetchedAt = (metadata === null || metadata === void 0 ? void 0 : metadata.roadStatusFetchedAt) || ((_b = metadata === null || metadata === void 0 ? void 0 : metadata.roadStatus) === null || _b === void 0 ? void 0 : _b.fetchedAt);
                if (roadStatusFetchedAt) {
                    return new Date(roadStatusFetchedAt);
                }
            }
            else if (item.type === evidence_dto_1.EvidenceType.OPENING_HOURS) {
                const openingHoursFetchedAt = (metadata === null || metadata === void 0 ? void 0 : metadata.openingHoursFetchedAt) || ((_c = metadata === null || metadata === void 0 ? void 0 : metadata.openingHours) === null || _c === void 0 ? void 0 : _c.fetchedAt);
                if (openingHoursFetchedAt) {
                    return new Date(openingHoursFetchedAt);
                }
            }
            if (place.updatedAt) {
                return new Date(place.updatedAt);
            }
        }
        if (item.timestamp) {
            return new Date(item.timestamp);
        }
        return undefined;
    }
    getTTLForEvidenceType(type) {
        return this.TTL_MAP[type] || this.TTL_MAP[evidence_dto_1.EvidenceType.OTHER];
    }
};
exports.EvidenceFreshnessCalculator = EvidenceFreshnessCalculator;
exports.EvidenceFreshnessCalculator = EvidenceFreshnessCalculator = EvidenceFreshnessCalculator_1 = __decorate([
    (0, common_1.Injectable)()
], EvidenceFreshnessCalculator);
//# sourceMappingURL=evidence-freshness-calculator.service.js.map