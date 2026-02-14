"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POLICY_PROFILES = void 0;
exports.getPolicyProfile = getPolicyProfile;
exports.POLICY_PROFILES = {
    relaxed: {
        name: 'relaxed',
        description: '轻松节奏，优先舒适度和体验质量',
        objectiveWeights: {
            satisfaction: 1.5,
            violationRisk: 1.2,
            robustness: 1.0,
            cost: 0.8,
        },
        abuConfig: {
            intentWeight: 1.2,
            qualityWeight: 1.0,
            uniquenessWeight: 0.8,
            weatherPenaltyFactor: 0.2,
            riskPenaltyFactor: 0.3,
            costPenaltyFactor: 0.1,
        },
        drdreConfig: {
            priorityWeights: {
                mustSee: 10,
                quality: 4,
                inventoryRisk: 0.3,
                travelTimePenalty: 0.1,
            },
        },
    },
    moderate: {
        name: 'moderate',
        description: '平衡节奏，兼顾体验和效率',
        objectiveWeights: {
            satisfaction: 1.2,
            violationRisk: 1.0,
            robustness: 1.0,
            cost: 1.0,
        },
        abuConfig: {
            intentWeight: 1.2,
            qualityWeight: 0.8,
            uniquenessWeight: 0.5,
            weatherPenaltyFactor: 0.15,
            riskPenaltyFactor: 0.2,
            costPenaltyFactor: 0.15,
        },
        drdreConfig: {
            priorityWeights: {
                mustSee: 10,
                quality: 3,
                inventoryRisk: 0.5,
                travelTimePenalty: 0.2,
            },
        },
    },
    intense: {
        name: 'intense',
        description: '紧凑节奏，最大化体验密度',
        objectiveWeights: {
            satisfaction: 1.0,
            violationRisk: 0.8,
            robustness: 1.2,
            cost: 1.2,
        },
        abuConfig: {
            intentWeight: 1.0,
            qualityWeight: 0.6,
            uniquenessWeight: 0.3,
            weatherPenaltyFactor: 0.1,
            riskPenaltyFactor: 0.1,
            costPenaltyFactor: 0.2,
        },
        drdreConfig: {
            priorityWeights: {
                mustSee: 10,
                quality: 2,
                inventoryRisk: 0.8,
                travelTimePenalty: 0.3,
            },
        },
    },
    family: {
        name: 'family',
        description: '亲子友好，低风险，高舒适度',
        objectiveWeights: {
            satisfaction: 1.3,
            violationRisk: 1.5,
            robustness: 1.3,
            cost: 0.9,
        },
        abuConfig: {
            intentWeight: 1.0,
            qualityWeight: 1.2,
            uniquenessWeight: 0.4,
            weatherPenaltyFactor: 0.3,
            riskPenaltyFactor: 0.6,
            costPenaltyFactor: 0.1,
        },
        drdreConfig: {
            priorityWeights: {
                mustSee: 10,
                quality: 5,
                inventoryRisk: 0.2,
                travelTimePenalty: 0.05,
            },
        },
    },
    photography: {
        name: 'photography',
        description: '摄影导向，优先最佳时段和独特视角',
        objectiveWeights: {
            satisfaction: 1.8,
            violationRisk: 1.0,
            robustness: 0.9,
            cost: 1.1,
        },
        abuConfig: {
            intentWeight: 1.5,
            qualityWeight: 1.0,
            uniquenessWeight: 1.2,
            weatherPenaltyFactor: 0.25,
            riskPenaltyFactor: 0.15,
            costPenaltyFactor: 0.12,
        },
        drdreConfig: {
            priorityWeights: {
                mustSee: 10,
                quality: 4,
                inventoryRisk: 0.4,
                travelTimePenalty: 0.15,
            },
        },
    },
    adventure: {
        name: 'adventure',
        description: '冒险导向，接受高风险高回报',
        objectiveWeights: {
            satisfaction: 1.2,
            violationRisk: 0.7,
            robustness: 1.1,
            cost: 1.0,
        },
        abuConfig: {
            intentWeight: 1.3,
            qualityWeight: 0.7,
            uniquenessWeight: 0.8,
            weatherPenaltyFactor: 0.1,
            riskPenaltyFactor: -0.2,
            costPenaltyFactor: 0.15,
        },
        drdreConfig: {
            priorityWeights: {
                mustSee: 10,
                quality: 2.5,
                inventoryRisk: 0.6,
                travelTimePenalty: 0.25,
            },
        },
    },
};
function getPolicyProfile(pace, style) {
    if (style && exports.POLICY_PROFILES[style]) {
        return exports.POLICY_PROFILES[style];
    }
    if (pace && exports.POLICY_PROFILES[pace]) {
        return exports.POLICY_PROFILES[pace];
    }
    return exports.POLICY_PROFILES.moderate;
}
//# sourceMappingURL=objective-config.js.map