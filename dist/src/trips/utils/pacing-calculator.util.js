"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PacingCalculator = void 0;
const create_trip_dto_1 = require("../dto/create-trip.dto");
class PacingCalculator {
    static calculateShortestStave(travelers) {
        if (!travelers || travelers.length === 0) {
            return this.getDefaultConfig();
        }
        let minStamina = 100;
        let minRecoveryRate = 0.4;
        let maxWalkSpeedFactor = 1.0;
        let maxStairsPenalty = 1.0;
        let minForcedRestInterval = Infinity;
        let terrainLimit = 'ALL';
        let minHpThreshold = 20;
        for (const traveler of travelers) {
            const profile = this.getProfileConfig(traveler.mobilityTag);
            minStamina = Math.min(minStamina, profile.max_daily_hp);
            minRecoveryRate = Math.min(minRecoveryRate, profile.hp_recovery_rate);
            maxWalkSpeedFactor = Math.max(maxWalkSpeedFactor, profile.walk_speed_factor);
            maxStairsPenalty = Math.max(maxStairsPenalty, profile.stairs_penalty_factor);
            minForcedRestInterval = Math.min(minForcedRestInterval, profile.forced_rest_interval_min);
            terrainLimit = this.getStricterTerrain(terrainLimit, profile.terrain_filter);
            minHpThreshold = Math.max(minHpThreshold, profile.min_hp_threshold || 20);
        }
        const desc = this.generateDescription(travelers, {
            minStamina,
            minForcedRestInterval,
            terrainLimit,
            maxStairsPenalty,
        });
        return {
            max_daily_hp: minStamina,
            hp_recovery_rate: minRecoveryRate,
            walk_speed_factor: maxWalkSpeedFactor,
            stairs_penalty_factor: maxStairsPenalty,
            forced_rest_interval_min: minForcedRestInterval === Infinity ? 120 : minForcedRestInterval,
            terrain_filter: terrainLimit,
            min_hp_threshold: minHpThreshold,
            desc,
        };
    }
    static getProfileConfig(mobilityTag) {
        switch (mobilityTag) {
            case create_trip_dto_1.MobilityTag.IRON_LEGS:
                return {
                    max_daily_hp: 100,
                    hp_recovery_rate: 0.5,
                    walk_speed_factor: 0.8,
                    stairs_penalty_factor: 1.0,
                    forced_rest_interval_min: 180,
                    terrain_filter: 'ALL',
                    min_hp_threshold: 10,
                };
            case create_trip_dto_1.MobilityTag.ACTIVE_SENIOR:
                return {
                    max_daily_hp: 80,
                    hp_recovery_rate: 0.4,
                    walk_speed_factor: 1.2,
                    stairs_penalty_factor: 999,
                    forced_rest_interval_min: 120,
                    terrain_filter: 'NO_STAIRS',
                    min_hp_threshold: 30,
                };
            case create_trip_dto_1.MobilityTag.CITY_POTATO:
                return {
                    max_daily_hp: 60,
                    hp_recovery_rate: 0.3,
                    walk_speed_factor: 1.0,
                    stairs_penalty_factor: 1.5,
                    forced_rest_interval_min: 60,
                    terrain_filter: 'ALL',
                    min_hp_threshold: 25,
                };
            case create_trip_dto_1.MobilityTag.LIMITED:
                return {
                    max_daily_hp: 40,
                    hp_recovery_rate: 0.2,
                    walk_speed_factor: 1.5,
                    stairs_penalty_factor: 999,
                    forced_rest_interval_min: 45,
                    terrain_filter: 'WHEELCHAIR_ONLY',
                    min_hp_threshold: 40,
                };
            default:
                return this.getDefaultConfig();
        }
    }
    static getDefaultConfig() {
        return {
            max_daily_hp: 100,
            hp_recovery_rate: 0.4,
            walk_speed_factor: 1.0,
            stairs_penalty_factor: 1.0,
            forced_rest_interval_min: 120,
            terrain_filter: 'ALL',
            min_hp_threshold: 20,
            desc: '标准成年人配置',
        };
    }
    static getStricterTerrain(current, newTerrain) {
        const strictness = {
            'ALL': 0,
            'NO_STAIRS': 1,
            'ELEVATOR_REQUIRED': 2,
            'WHEELCHAIR_ONLY': 3,
        };
        return strictness[newTerrain] > strictness[current] ? newTerrain : current;
    }
    static generateDescription(travelers, config) {
        const parts = [];
        const profiles = travelers.map(t => t.mobilityTag);
        const hasCityPotato = profiles.includes(create_trip_dto_1.MobilityTag.CITY_POTATO);
        const hasActiveSenior = profiles.includes(create_trip_dto_1.MobilityTag.ACTIVE_SENIOR);
        const hasLimited = profiles.includes(create_trip_dto_1.MobilityTag.LIMITED);
        if (hasCityPotato) {
            parts.push(`检测到体力短板（城市脆皮），建议每 ${config.minForcedRestInterval} 分钟休息一次`);
        }
        else if (hasLimited) {
            parts.push(`检测到行动不便成员，需要频繁休息（每 ${config.minForcedRestInterval} 分钟）`);
        }
        if (config.terrainLimit === 'NO_STAIRS' || config.maxStairsPenalty >= 999) {
            parts.push('避免楼梯和陡坡（膝盖保护）');
        }
        else if (config.terrainLimit === 'WHEELCHAIR_ONLY') {
            parts.push('仅限无障碍设施和轮椅通道');
        }
        if (config.minStamina < 60) {
            parts.push(`团队续航能力较弱（HP上限：${config.minStamina}），建议安排轻松行程`);
        }
        return parts.length > 0 ? parts.join('；') : '全员体力充沛，可安排高强度行程';
    }
}
exports.PacingCalculator = PacingCalculator;
//# sourceMappingURL=pacing-calculator.util.js.map