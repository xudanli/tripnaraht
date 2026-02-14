"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TERRAIN_POLICY = void 0;
exports.DEFAULT_TERRAIN_POLICY = {
    riskThresholds: {
        highAltitudeM: 3500,
        rapidAscentM: 500,
        steepSlopePct: 15,
        bigAscentDayM: 1500,
    },
    effortLevelMapping: {
        relaxMax: 30,
        moderateMax: 60,
        challengeMax: 85,
        extremeMin: 85,
    },
    decisionWeights: {
        altitudePenalty: 1.0,
        ascentPenalty: 1.5,
        slopePenalty: 2.0,
        rapidAscentPenalty: 3.0,
    },
    terrainConstraints: {
        firstDayMaxElevationM: 3000,
        maxDailyAscentM: 1000,
        maxConsecutiveHighAscentDays: 2,
        highAltitudeBufferHours: 2,
    },
    terrainActions: {
        allowIntensityDowngrade: true,
        allowDaySplit: true,
        allowSteepSegmentReplacement: true,
        allowRestDayInsertion: true,
    },
};
//# sourceMappingURL=terrain-policy.config.js.map