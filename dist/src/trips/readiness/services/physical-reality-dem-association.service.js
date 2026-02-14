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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PhysicalRealityDEMAssociationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhysicalRealityDEMAssociationService = void 0;
const common_1 = require("@nestjs/common");
const physical_reality_retrieval_service_1 = require("./physical-reality-retrieval.service");
const dem_elevation_service_1 = require("../../dem/services/dem-elevation.service");
let PhysicalRealityDEMAssociationService = PhysicalRealityDEMAssociationService_1 = class PhysicalRealityDEMAssociationService {
    constructor(physicalRealityService, demService) {
        this.physicalRealityService = physicalRealityService;
        this.demService = demService;
        this.logger = new common_1.Logger(PhysicalRealityDEMAssociationService_1.name);
    }
    async enhanceRoadStateWithDEM(roadState) {
        var _a, _b;
        if (!this.demService) {
            this.logger.debug('DEM service not available, skipping terrain features');
            return {
                ...roadState,
                terrainFeatures: {
                    roadId: roadState.roadId,
                    demAvailable: false,
                },
            };
        }
        if (!((_a = roadState.coordinates) === null || _a === void 0 ? void 0 : _a.start) || !((_b = roadState.coordinates) === null || _b === void 0 ? void 0 : _b.end)) {
            this.logger.debug(`Road ${roadState.roadId} has no coordinates, skipping DEM query`);
            return {
                ...roadState,
                terrainFeatures: {
                    roadId: roadState.roadId,
                    demAvailable: false,
                },
            };
        }
        try {
            const terrainFeatures = await this.calculateTerrainFeatures(roadState);
            return {
                ...roadState,
                terrainFeatures,
            };
        }
        catch (error) {
            this.logger.warn(`Failed to calculate terrain features for road ${roadState.roadId}:`, error);
            return {
                ...roadState,
                terrainFeatures: {
                    roadId: roadState.roadId,
                    demAvailable: false,
                },
            };
        }
    }
    async enhanceRoadStatesWithDEM(roadStates) {
        if (!this.demService) {
            return roadStates.map(road => ({
                ...road,
                terrainFeatures: {
                    roadId: road.roadId,
                    demAvailable: false,
                },
            }));
        }
        const enhancedRoads = await Promise.all(roadStates.map(road => this.enhanceRoadStateWithDEM(road)));
        return enhancedRoads;
    }
    async calculateTerrainFeatures(roadState) {
        const start = roadState.coordinates.start;
        const end = roadState.coordinates.end;
        const startElevation = await this.demService.getElevation(start.lat, start.lng);
        const endElevation = await this.demService.getElevation(end.lat, end.lng);
        if (startElevation === null && endElevation === null) {
            return {
                roadId: roadState.roadId,
                demAvailable: false,
            };
        }
        const features = {
            roadId: roadState.roadId,
            startElevation: startElevation !== null && startElevation !== void 0 ? startElevation : undefined,
            endElevation: endElevation !== null && endElevation !== void 0 ? endElevation : undefined,
            demAvailable: true,
        };
        if (startElevation !== null && endElevation !== null) {
            features.avgElevation = (startElevation + endElevation) / 2;
            features.maxElevation = Math.max(startElevation, endElevation);
            features.minElevation = Math.min(startElevation, endElevation);
        }
        else if (startElevation !== null) {
            features.avgElevation = startElevation;
            features.maxElevation = startElevation;
            features.minElevation = startElevation;
        }
        else if (endElevation !== null) {
            features.avgElevation = endElevation;
            features.maxElevation = endElevation;
            features.minElevation = endElevation;
        }
        if (startElevation !== null && endElevation !== null) {
            const elevationDiff = endElevation - startElevation;
            if (elevationDiff > 0) {
                features.totalAscent = elevationDiff;
                features.totalDescent = 0;
            }
            else {
                features.totalAscent = 0;
                features.totalDescent = Math.abs(elevationDiff);
            }
        }
        if (startElevation !== null && endElevation !== null && roadState.coordinates) {
            const distance = this.calculateDistance(start.lat, start.lng, end.lat, end.lng);
            if (distance > 0) {
                const elevationDiff = endElevation - startElevation;
                const slope = (elevationDiff / distance) * 100;
                features.avgSlope = Math.abs(slope);
                features.maxSlope = Math.abs(slope);
            }
        }
        features.terrainComplexity = this.calculateTerrainComplexity(features);
        return features;
    }
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const dLat = this.toRadians(lat2 - lat1);
        const dLng = this.toRadians(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(lat1)) *
                Math.cos(this.toRadians(lat2)) *
                Math.sin(dLng / 2) *
                Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
    calculateTerrainComplexity(features) {
        let complexity = 0;
        if (features.avgElevation !== undefined) {
            const elevationFactor = Math.min(features.avgElevation / 3000, 1) * 0.3;
            complexity += elevationFactor;
        }
        if (features.avgSlope !== undefined) {
            const slopeFactor = Math.min(features.avgSlope / 20, 1) * 0.4;
            complexity += slopeFactor;
        }
        if (features.totalAscent !== undefined && features.totalDescent !== undefined) {
            const totalChange = features.totalAscent + features.totalDescent;
            const changeFactor = Math.min(totalChange / 1000, 1) * 0.3;
            complexity += changeFactor;
        }
        return Math.min(Math.round(complexity * 100) / 100, 1.0);
    }
    async retrieveAndEnhanceRoadStates(region, options) {
        if (!this.physicalRealityService) {
            this.logger.warn('PhysicalRealityRetrievalService not available');
            return [];
        }
        const data = await this.physicalRealityService.retrievePhysicalRealityData(region, options);
        return await this.enhanceRoadStatesWithDEM(data.roadStates);
    }
};
exports.PhysicalRealityDEMAssociationService = PhysicalRealityDEMAssociationService;
exports.PhysicalRealityDEMAssociationService = PhysicalRealityDEMAssociationService = PhysicalRealityDEMAssociationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [physical_reality_retrieval_service_1.PhysicalRealityRetrievalService,
        dem_elevation_service_1.DEMElevationService])
], PhysicalRealityDEMAssociationService);
//# sourceMappingURL=physical-reality-dem-association.service.js.map