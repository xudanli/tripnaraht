"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STRATEGY_MODE_WEIGHTS = void 0;
exports.extractStrategyModeFromKeywords = extractStrategyModeFromKeywords;
exports.createStrategyParams = createStrategyParams;
exports.STRATEGY_MODE_WEIGHTS = {
    SURVIVAL: {
        abu: 0.5,
        drDre: 0.3,
        neptune: 0.2,
        cost: 0.2,
        experience: 0.3,
        timeEfficiency: 0.3,
    },
    COMFORT: {
        abu: 0.3,
        drDre: 0.5,
        neptune: 0.2,
        cost: 0.3,
        experience: 0.4,
        timeEfficiency: 0.2,
    },
    PHOTOGRAPHY: {
        abu: 0.3,
        drDre: 0.3,
        neptune: 0.4,
        cost: 0.2,
        experience: 0.6,
        timeEfficiency: 0.2,
    },
    BUDGET: {
        abu: 0.3,
        drDre: 0.3,
        neptune: 0.4,
        cost: 0.8,
        experience: 0.3,
        timeEfficiency: 0.3,
    },
    TIME: {
        abu: 0.3,
        drDre: 0.4,
        neptune: 0.3,
        cost: 0.3,
        experience: 0.3,
        timeEfficiency: 0.8,
    },
    ADVENTURE: {
        abu: 0.2,
        drDre: 0.3,
        neptune: 0.5,
        cost: 0.2,
        experience: 0.8,
        timeEfficiency: 0.3,
    },
};
function extractStrategyModeFromKeywords(keywords) {
    const lowerKeywords = keywords.map(k => k.toLowerCase());
    if (lowerKeywords.some(k => k.includes('摄影') || k.includes('拍照') || k.includes('photo'))) {
        return 'PHOTOGRAPHY';
    }
    if (lowerKeywords.some(k => k.includes('穷游') || k.includes('便宜') || k.includes('budget') || k.includes('cheap'))) {
        return 'BUDGET';
    }
    if (lowerKeywords.some(k => k.includes('时间紧') || k.includes('快') || k.includes('time') || k.includes('efficient'))) {
        return 'TIME';
    }
    if (lowerKeywords.some(k => k.includes('冒险') || k.includes('刺激') || k.includes('adventure') || k.includes('extreme'))) {
        return 'ADVENTURE';
    }
    if (lowerKeywords.some(k => k.includes('舒适') || k.includes('轻松') || k.includes('comfort') || k.includes('relax'))) {
        return 'COMFORT';
    }
    if (lowerKeywords.some(k => k.includes('安全') || k.includes('稳妥') || k.includes('safe') || k.includes('survival'))) {
        return 'SURVIVAL';
    }
    return null;
}
function createStrategyParams(mode, customWeights) {
    const defaultWeights = exports.STRATEGY_MODE_WEIGHTS[mode];
    return {
        mode,
        weights: {
            ...defaultWeights,
            ...customWeights,
        },
    };
}
//# sourceMappingURL=strategy-mode.types.js.map