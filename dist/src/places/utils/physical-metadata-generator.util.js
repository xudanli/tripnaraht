"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhysicalMetadataGenerator = void 0;
const client_1 = require("@prisma/client");
const physical_metadata_constants_1 = require("./physical-metadata-constants");
class PhysicalMetadataGenerator {
    static generateByCategory(category, metadata) {
        const base = this.getDefaultByCategory(category);
        if (metadata) {
            return this.enhanceFromMetadata(base, metadata, category);
        }
        return this.normalize(base);
    }
    static getDefaultByCategory(category) {
        switch (category) {
            case client_1.PlaceCategory.ATTRACTION:
                return {
                    base_fatigue_score: 5,
                    terrain_type: physical_metadata_constants_1.TERRAIN_TYPES.FLAT,
                    seated_ratio: 0.2,
                    intensity_factor: 1.0,
                    has_elevator: false,
                    wheelchair_accessible: false,
                    estimated_duration_min: 60,
                };
            case client_1.PlaceCategory.RESTAURANT:
                return {
                    base_fatigue_score: 2,
                    terrain_type: physical_metadata_constants_1.TERRAIN_TYPES.FLAT,
                    seated_ratio: 0.9,
                    intensity_factor: 0.3,
                    has_elevator: false,
                    wheelchair_accessible: false,
                    estimated_duration_min: 60,
                };
            case client_1.PlaceCategory.SHOPPING:
                return {
                    base_fatigue_score: 4,
                    terrain_type: physical_metadata_constants_1.TERRAIN_TYPES.FLAT,
                    seated_ratio: 0.1,
                    intensity_factor: 0.8,
                    has_elevator: false,
                    wheelchair_accessible: false,
                    estimated_duration_min: 90,
                };
            case client_1.PlaceCategory.HOTEL:
                return {
                    base_fatigue_score: 1,
                    terrain_type: physical_metadata_constants_1.TERRAIN_TYPES.ELEVATOR_AVAILABLE,
                    seated_ratio: 0.95,
                    intensity_factor: 0.2,
                    has_elevator: true,
                    wheelchair_accessible: false,
                    estimated_duration_min: 480,
                };
            case client_1.PlaceCategory.TRANSIT_HUB:
                return {
                    base_fatigue_score: 4,
                    terrain_type: physical_metadata_constants_1.TERRAIN_TYPES.FLAT,
                    seated_ratio: 0.3,
                    intensity_factor: 0.9,
                    has_elevator: false,
                    wheelchair_accessible: false,
                    estimated_duration_min: 30,
                };
            default:
                return {
                    base_fatigue_score: 5,
                    terrain_type: physical_metadata_constants_1.TERRAIN_TYPES.FLAT,
                    seated_ratio: 0.2,
                    intensity_factor: 1.0,
                    has_elevator: false,
                    wheelchair_accessible: false,
                    estimated_duration_min: 60,
                };
        }
    }
    static enhanceFromMetadata(base, metadata, category) {
        const patches = [];
        if (this.isValidString(metadata.accessType)) {
            patches.push(this.patchFromAccessType(metadata.accessType));
        }
        if (this.isValidString(metadata.typicalStay)) {
            patches.push(this.patchFromTypicalStay(metadata.typicalStay));
        }
        if (this.isValidNumber(metadata.elevationMeters)) {
            patches.push(this.patchFromElevation(metadata.elevationMeters));
        }
        const durationPatch = this.getDurationFromDataSources(metadata);
        if (durationPatch) {
            patches.push(durationPatch);
        }
        else if (this.isValidString(metadata.visitDuration)) {
            const duration = this.parseDuration(metadata.visitDuration);
            if (duration) {
                patches.push({
                    estimated_duration_min: duration,
                    source: 'visitDuration',
                });
            }
        }
        if (metadata.facilities) {
            patches.push(this.patchFromFacilities(metadata.facilities));
        }
        if (this.isValidString(metadata.subCategory)) {
            patches.push(this.patchFromSubCategory(metadata.subCategory));
        }
        const enhanced = this.mergePatches(base, patches);
        const final = this.applyDifficultyModifier(enhanced, metadata.trailDifficulty);
        return this.normalize(final);
    }
    static applyDifficultyModifier(metadata, trailDifficulty) {
        if (!trailDifficulty || !this.isValidString(trailDifficulty)) {
            return metadata;
        }
        const upper = trailDifficulty.toUpperCase();
        let modifier = 1.0;
        if (upper.includes(physical_metadata_constants_1.TRAIL_DIFFICULTY.EASY) || upper === 'EASY') {
            modifier = 0.95;
        }
        else if (upper.includes(physical_metadata_constants_1.TRAIL_DIFFICULTY.MODERATE) || upper === 'MODERATE') {
            modifier = 1.0;
        }
        else if (upper.includes(physical_metadata_constants_1.TRAIL_DIFFICULTY.HARD) || upper === 'HARD') {
            modifier = 1.1;
        }
        else if (upper.includes(physical_metadata_constants_1.TRAIL_DIFFICULTY.EXTREME) || upper === 'EXTREME') {
            modifier = 1.15;
        }
        return {
            ...metadata,
            intensity_factor: (metadata.intensity_factor || 1.0) * modifier,
        };
    }
    static patchFromAccessType(accessType) {
        const upper = accessType.toUpperCase();
        if (upper.includes(physical_metadata_constants_1.ACCESS_TYPES.HIKING) || upper.includes(physical_metadata_constants_1.ACCESS_TYPES.TREKKING)) {
            return {
                terrain_type: physical_metadata_constants_1.TERRAIN_TYPES.HILLY,
                intensity_factor: 1.5,
                seated_ratio: 0,
                source: 'accessType:HIKING',
            };
        }
        if (upper.includes(physical_metadata_constants_1.ACCESS_TYPES.VEHICLE) || upper.includes(physical_metadata_constants_1.ACCESS_TYPES.BOAT)) {
            return {
                seated_ratio: 0.8,
                intensity_factor: 0.6,
                source: 'accessType:VEHICLE',
            };
        }
        if (upper.includes(physical_metadata_constants_1.ACCESS_TYPES.CABLE_CAR)) {
            return {
                terrain_type: physical_metadata_constants_1.TERRAIN_TYPES.ELEVATOR_AVAILABLE,
                has_elevator: true,
                seated_ratio: 0.7,
                intensity_factor: 0.5,
                source: 'accessType:CABLE_CAR',
            };
        }
        return {};
    }
    static patchFromTypicalStay(stay) {
        const upper = stay.toUpperCase();
        if (upper.includes(physical_metadata_constants_1.TYPICAL_STAY.PHOTO_STOP) || upper === 'PHOTO_STOP') {
            return {
                estimated_duration_min: 15,
                seated_ratio: 0.1,
                intensity_factor: 0.6,
                source: 'typicalStay:PHOTO_STOP',
            };
        }
        if (upper.includes(physical_metadata_constants_1.TYPICAL_STAY.SHORT_WALK) || upper === 'SHORT_WALK') {
            return {
                estimated_duration_min: 30,
                seated_ratio: 0,
                intensity_factor: 0.8,
                source: 'typicalStay:SHORT_WALK',
            };
        }
        if (upper.includes(physical_metadata_constants_1.TYPICAL_STAY.HALF_DAY_HIKE) || upper === 'HALF_DAY_HIKE') {
            return {
                estimated_duration_min: 240,
                terrain_type: physical_metadata_constants_1.TERRAIN_TYPES.HILLY,
                intensity_factor: 1.5,
                seated_ratio: 0,
                source: 'typicalStay:HALF_DAY_HIKE',
            };
        }
        if (upper.includes(physical_metadata_constants_1.TYPICAL_STAY.FULL_DAY_HIKE) || upper === 'FULL_DAY_HIKE') {
            return {
                estimated_duration_min: 480,
                terrain_type: physical_metadata_constants_1.TERRAIN_TYPES.HILLY,
                intensity_factor: 2.0,
                seated_ratio: 0,
                source: 'typicalStay:FULL_DAY_HIKE',
            };
        }
        return {};
    }
    static getDurationFromDataSources(metadata) {
        if (this.isValidNumber(metadata.officialDurationMin)) {
            return {
                estimated_duration_min: metadata.officialDurationMin,
                source: 'officialDurationMin',
            };
        }
        if (this.isValidNumber(metadata.googlePopularTimesDurationMin)) {
            return {
                estimated_duration_min: metadata.googlePopularTimesDurationMin,
                source: 'googlePopularTimesDurationMin',
            };
        }
        if (this.isValidNumber(metadata.medianDurationBySimilarPoi)) {
            return {
                estimated_duration_min: metadata.medianDurationBySimilarPoi,
                source: 'medianDurationBySimilarPoi',
            };
        }
        return null;
    }
    static patchFromElevation(elevationMeters) {
        if (typeof elevationMeters !== 'number' || isNaN(elevationMeters)) {
            return {};
        }
        if (elevationMeters > physical_metadata_constants_1.HIGH_ELEVATION_THRESHOLD) {
            return {
                intensity_factor: 1.3,
                source: 'elevationMeters',
            };
        }
        return {};
    }
    static patchFromFacilities(facilities) {
        var _a, _b;
        const patch = {
            source: 'facilities',
        };
        if ((_a = facilities.wheelchair) === null || _a === void 0 ? void 0 : _a.hasElevator) {
            patch.has_elevator = true;
            patch.terrain_type = physical_metadata_constants_1.TERRAIN_TYPES.ELEVATOR_AVAILABLE;
        }
        if ((_b = facilities.wheelchair) === null || _b === void 0 ? void 0 : _b.accessible) {
            patch.wheelchair_accessible = true;
        }
        return Object.keys(patch).length > 1 ? patch : {};
    }
    static patchFromSubCategory(subCategory) {
        const lower = subCategory.toLowerCase();
        if (lower.includes('volcano') || lower.includes('glacier')) {
            return {
                intensity_factor: 1.8,
                terrain_type: physical_metadata_constants_1.TERRAIN_TYPES.HILLY,
                base_fatigue_score: 8,
                source: 'subCategory:volcano/glacier',
            };
        }
        if (lower.includes('hot_spring') || lower.includes('viewpoint') || lower.includes('hotspring')) {
            return {
                intensity_factor: 0.6,
                seated_ratio: 0.3,
                source: 'subCategory:hot_spring/viewpoint',
            };
        }
        return {};
    }
    static mergePatches(base, patches) {
        let result = { ...base };
        let maxTerrainIntensity = physical_metadata_constants_1.TERRAIN_INTENSITY[result.terrain_type] || 1;
        let selectedTerrain = result.terrain_type;
        for (const patch of patches) {
            if (patch.terrain_type) {
                const intensity = physical_metadata_constants_1.TERRAIN_INTENSITY[patch.terrain_type];
                if (intensity > maxTerrainIntensity) {
                    maxTerrainIntensity = intensity;
                    selectedTerrain = patch.terrain_type;
                }
            }
        }
        if (selectedTerrain) {
            result.terrain_type = selectedTerrain;
        }
        let intensityMultiplier = 1.0;
        for (const patch of patches) {
            if (patch.intensity_factor !== undefined) {
                intensityMultiplier *= patch.intensity_factor;
            }
        }
        result.intensity_factor = (result.intensity_factor || 1.0) * intensityMultiplier;
        for (const patch of patches) {
            if (patch.base_fatigue_score !== undefined) {
                result.base_fatigue_score = patch.base_fatigue_score;
            }
            if (patch.seated_ratio !== undefined) {
                result.seated_ratio = patch.seated_ratio;
            }
            if (patch.estimated_duration_min !== undefined) {
                result.estimated_duration_min = patch.estimated_duration_min;
            }
            if (patch.has_elevator !== undefined) {
                result.has_elevator = patch.has_elevator;
            }
            if (patch.wheelchair_accessible !== undefined) {
                result.wheelchair_accessible = patch.wheelchair_accessible;
            }
        }
        return result;
    }
    static normalize(metadata) {
        var _a, _b;
        return {
            base_fatigue_score: this.clamp(Math.round(metadata.base_fatigue_score), physical_metadata_constants_1.METADATA_LIMITS.BASE_FATIGUE_SCORE.min, physical_metadata_constants_1.METADATA_LIMITS.BASE_FATIGUE_SCORE.max),
            terrain_type: metadata.terrain_type,
            seated_ratio: this.clamp(metadata.seated_ratio, physical_metadata_constants_1.METADATA_LIMITS.SEATED_RATIO.min, physical_metadata_constants_1.METADATA_LIMITS.SEATED_RATIO.max),
            intensity_factor: metadata.intensity_factor
                ? this.clamp(metadata.intensity_factor, physical_metadata_constants_1.METADATA_LIMITS.INTENSITY_FACTOR.min, physical_metadata_constants_1.METADATA_LIMITS.INTENSITY_FACTOR.max)
                : undefined,
            has_elevator: (_a = metadata.has_elevator) !== null && _a !== void 0 ? _a : false,
            wheelchair_accessible: (_b = metadata.wheelchair_accessible) !== null && _b !== void 0 ? _b : false,
            estimated_duration_min: metadata.estimated_duration_min
                ? this.clamp(Math.round(metadata.estimated_duration_min), physical_metadata_constants_1.METADATA_LIMITS.ESTIMATED_DURATION_MIN.min, physical_metadata_constants_1.METADATA_LIMITS.ESTIMATED_DURATION_MIN.max)
                : undefined,
        };
    }
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
    static isValidString(value) {
        return typeof value === 'string' && value.trim().length > 0;
    }
    static isValidNumber(value) {
        return typeof value === 'number' && !isNaN(value);
    }
    static parseDuration(durationStr) {
        if (!durationStr || typeof durationStr !== 'string') {
            return null;
        }
        const str = durationStr.trim().toLowerCase();
        if (str.includes('半天') || str.includes('half day')) {
            return 240;
        }
        if (str.includes('全天') || str.includes('full day') || str.includes('一天')) {
            return 480;
        }
        const hourPatterns = [
            /约?\s*(\d+(?:\.\d+)?)\s*-?\s*(\d+(?:\.\d+)?)?\s*小时/i,
            /约?\s*(\d+(?:\.\d+)?)\s*-?\s*(\d+(?:\.\d+)?)?\s*h/i,
        ];
        for (const pattern of hourPatterns) {
            const match = str.match(pattern);
            if (match) {
                const min = parseFloat(match[1]);
                const max = match[2] ? parseFloat(match[2]) : min;
                const avg = (min + max) / 2;
                return Math.round(avg * 60);
            }
        }
        const minPatterns = [
            /(\d+)\s*分钟/i,
            /(\d+)\s*min/i,
        ];
        for (const pattern of minPatterns) {
            const match = str.match(pattern);
            if (match) {
                return parseInt(match[1], 10);
            }
        }
        return null;
    }
    static generateFromNaturePoi(poiMetadata) {
        const base = this.getDefaultByCategory(client_1.PlaceCategory.ATTRACTION);
        return this.enhanceFromMetadata(base, poiMetadata, client_1.PlaceCategory.ATTRACTION);
    }
}
exports.PhysicalMetadataGenerator = PhysicalMetadataGenerator;
//# sourceMappingURL=physical-metadata-generator.util.js.map