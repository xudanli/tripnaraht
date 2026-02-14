"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrailFatigueCalculator = void 0;
class TrailFatigueCalculator {
    static calculateFatigue(trail, pacingConfig) {
        const baseHpCost = trail.distanceKm * 2 + trail.elevationGainM / 100;
        const difficultyMultiplier = this.getDifficultyMultiplier(trail.difficultyLevel);
        const difficultyPenalty = baseHpCost * (difficultyMultiplier - 1);
        const elevationMultiplier = this.getElevationMultiplier(trail.maxElevationM);
        const elevationPenalty = baseHpCost * (elevationMultiplier - 1);
        const totalHpCost = baseHpCost + difficultyPenalty + elevationPenalty;
        const adjustedHpCost = totalHpCost * pacingConfig.walk_speed_factor;
        const estimatedDurationMin = trail.estimatedDurationHours
            ? trail.estimatedDurationHours * 60
            : this.estimateDuration(trail.distanceKm, trail.elevationGainM, pacingConfig);
        const exceedsLimit = adjustedHpCost > pacingConfig.max_daily_hp * 0.8;
        const recommendedRestCount = this.calculateRestCount(adjustedHpCost, estimatedDurationMin, pacingConfig);
        return {
            baseHpCost,
            difficultyPenalty,
            elevationPenalty,
            totalHpCost: adjustedHpCost,
            estimatedDurationMin,
            exceedsLimit,
            recommendedRestCount,
        };
    }
    static getDifficultyMultiplier(difficulty) {
        switch (difficulty) {
            case 'EASY':
                return 0.9;
            case 'MODERATE':
                return 1.0;
            case 'HARD':
                return 1.2;
            case 'EXTREME':
                return 1.5;
            default:
                return 1.0;
        }
    }
    static getElevationMultiplier(maxElevationM) {
        if (!maxElevationM)
            return 1.0;
        if (maxElevationM < 1500)
            return 1.0;
        if (maxElevationM < 2500)
            return 1.05;
        if (maxElevationM < 3000)
            return 1.10;
        if (maxElevationM < 3500)
            return 1.20;
        if (maxElevationM < 4000)
            return 1.30;
        if (maxElevationM < 4500)
            return 1.45;
        if (maxElevationM < 5000)
            return 1.60;
        if (maxElevationM < 5500)
            return 1.80;
        if (maxElevationM < 6000)
            return 2.10;
        if (maxElevationM < 7000)
            return 2.50;
        return 3.0;
    }
    static estimateDuration(distanceKm, elevationGainM, pacingConfig) {
        const baseTime = (distanceKm / 4) * 60;
        const elevationTime = (elevationGainM / 100) * 15;
        const totalTime = (baseTime + elevationTime) * pacingConfig.walk_speed_factor;
        return Math.ceil(totalTime);
    }
    static calculateRestCount(hpCost, durationMin, pacingConfig) {
        if (hpCost > pacingConfig.max_daily_hp * 0.5) {
            const restInterval = pacingConfig.forced_rest_interval_min || 120;
            const restCount = Math.floor(durationMin / restInterval);
            return Math.max(1, restCount);
        }
        return 0;
    }
    static isTrailSuitable(trail, pacingConfig) {
        const fatigueResult = this.calculateFatigue(trail, pacingConfig);
        if (fatigueResult.exceedsLimit) {
            return {
                suitable: false,
                reason: `该路线预计消耗 ${fatigueResult.totalHpCost.toFixed(1)} HP，超过您的体力上限（${pacingConfig.max_daily_hp} HP）的80%`,
                fatigueResult,
            };
        }
        if (pacingConfig.terrain_filter === 'NO_STAIRS' && trail.elevationGainM > 500) {
            return {
                suitable: false,
                reason: '该路线包含大量爬升，不适合您的身体状况',
                fatigueResult,
            };
        }
        if (pacingConfig.terrain_filter === 'WHEELCHAIR_ONLY') {
            return {
                suitable: false,
                reason: '该路线不适合轮椅通行',
                fatigueResult,
            };
        }
        return {
            suitable: true,
            fatigueResult,
        };
    }
}
exports.TrailFatigueCalculator = TrailFatigueCalculator;
//# sourceMappingURL=trail-fatigue-calculator.util.js.map