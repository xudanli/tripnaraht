export declare const TERRAIN_TYPES: {
    readonly FLAT: "FLAT";
    readonly ELEVATOR_AVAILABLE: "ELEVATOR_AVAILABLE";
    readonly HILLY: "HILLY";
    readonly STAIRS_ONLY: "STAIRS_ONLY";
};
export type TerrainType = typeof TERRAIN_TYPES[keyof typeof TERRAIN_TYPES];
export declare const TERRAIN_INTENSITY: Record<TerrainType, number>;
export declare const TRAIL_DIFFICULTY: {
    readonly EASY: "EASY";
    readonly MODERATE: "MODERATE";
    readonly HARD: "HARD";
    readonly EXTREME: "EXTREME";
};
export type TrailDifficulty = typeof TRAIL_DIFFICULTY[keyof typeof TRAIL_DIFFICULTY];
export declare const ACCESS_TYPES: {
    readonly WALKING: "WALKING";
    readonly HIKING: "HIKING";
    readonly TREKKING: "TREKKING";
    readonly VEHICLE: "VEHICLE";
    readonly BOAT: "BOAT";
    readonly CABLE_CAR: "CABLE_CAR";
};
export type AccessType = typeof ACCESS_TYPES[keyof typeof ACCESS_TYPES];
export declare const TYPICAL_STAY: {
    readonly PHOTO_STOP: "PHOTO_STOP";
    readonly SHORT_WALK: "SHORT_WALK";
    readonly HALF_DAY_HIKE: "HALF_DAY_HIKE";
    readonly FULL_DAY_HIKE: "FULL_DAY_HIKE";
};
export type TypicalStay = typeof TYPICAL_STAY[keyof typeof TYPICAL_STAY];
export declare const METADATA_LIMITS: {
    readonly BASE_FATIGUE_SCORE: {
        readonly min: 1;
        readonly max: 10;
    };
    readonly INTENSITY_FACTOR: {
        readonly min: 0.2;
        readonly max: 2.5;
    };
    readonly SEATED_RATIO: {
        readonly min: 0;
        readonly max: 1;
    };
    readonly ESTIMATED_DURATION_MIN: {
        readonly min: 5;
        readonly max: number;
    };
};
export declare const HIGH_ELEVATION_THRESHOLD = 2000;
