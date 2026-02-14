"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HIGH_ELEVATION_THRESHOLD = exports.METADATA_LIMITS = exports.TYPICAL_STAY = exports.ACCESS_TYPES = exports.TRAIL_DIFFICULTY = exports.TERRAIN_INTENSITY = exports.TERRAIN_TYPES = void 0;
exports.TERRAIN_TYPES = {
    FLAT: 'FLAT',
    ELEVATOR_AVAILABLE: 'ELEVATOR_AVAILABLE',
    HILLY: 'HILLY',
    STAIRS_ONLY: 'STAIRS_ONLY',
};
exports.TERRAIN_INTENSITY = {
    [exports.TERRAIN_TYPES.FLAT]: 1,
    [exports.TERRAIN_TYPES.ELEVATOR_AVAILABLE]: 1,
    [exports.TERRAIN_TYPES.HILLY]: 2,
    [exports.TERRAIN_TYPES.STAIRS_ONLY]: 3,
};
exports.TRAIL_DIFFICULTY = {
    EASY: 'EASY',
    MODERATE: 'MODERATE',
    HARD: 'HARD',
    EXTREME: 'EXTREME',
};
exports.ACCESS_TYPES = {
    WALKING: 'WALKING',
    HIKING: 'HIKING',
    TREKKING: 'TREKKING',
    VEHICLE: 'VEHICLE',
    BOAT: 'BOAT',
    CABLE_CAR: 'CABLE_CAR',
};
exports.TYPICAL_STAY = {
    PHOTO_STOP: 'PHOTO_STOP',
    SHORT_WALK: 'SHORT_WALK',
    HALF_DAY_HIKE: 'HALF_DAY_HIKE',
    FULL_DAY_HIKE: 'FULL_DAY_HIKE',
};
exports.METADATA_LIMITS = {
    BASE_FATIGUE_SCORE: { min: 1, max: 10 },
    INTENSITY_FACTOR: { min: 0.2, max: 2.5 },
    SEATED_RATIO: { min: 0, max: 1 },
    ESTIMATED_DURATION_MIN: { min: 5, max: 12 * 60 },
};
exports.HIGH_ELEVATION_THRESHOLD = 2000;
//# sourceMappingURL=physical-metadata-constants.js.map