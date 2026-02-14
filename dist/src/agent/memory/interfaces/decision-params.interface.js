"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDefaultDecisionParams = createDefaultDecisionParams;
exports.normalizeDecisionParams = normalizeDecisionParams;
function createDefaultDecisionParams() {
    return {
        routeDirectionBias: {
            difficultyWeight: 0.5,
            sceneryWeight: 0.5,
            adventureWeight: 0.5,
            stabilityWeight: 0.5,
        },
        constraints: {},
        strategyPreference: {
            abuWeight: 0.33,
            drDreWeight: 0.33,
            neptuneWeight: 0.34,
        },
        repairPolicy: {
            preferSplitDays: false,
            preferAltRoute: false,
            preferRestDay: false,
        },
    };
}
function normalizeDecisionParams(params) {
    const strategySum = params.strategyPreference.abuWeight +
        params.strategyPreference.drDreWeight +
        params.strategyPreference.neptuneWeight;
    if (strategySum > 0) {
        params.strategyPreference.abuWeight /= strategySum;
        params.strategyPreference.drDreWeight /= strategySum;
        params.strategyPreference.neptuneWeight /= strategySum;
    }
    const biasSum = params.routeDirectionBias.difficultyWeight +
        params.routeDirectionBias.sceneryWeight +
        params.routeDirectionBias.adventureWeight +
        params.routeDirectionBias.stabilityWeight;
    if (biasSum > 0) {
        params.routeDirectionBias.difficultyWeight /= biasSum;
        params.routeDirectionBias.sceneryWeight /= biasSum;
        params.routeDirectionBias.adventureWeight /= biasSum;
        params.routeDirectionBias.stabilityWeight /= biasSum;
    }
    if (params.constraints.maxDailyAscentM) {
        params.constraints.maxDailyAscentM = Math.max(0, Math.min(2000, params.constraints.maxDailyAscentM));
    }
    if (params.constraints.maxElevationM) {
        params.constraints.maxElevationM = Math.max(0, Math.min(8000, params.constraints.maxElevationM));
    }
    if (params.constraints.maxSlopePct) {
        params.constraints.maxSlopePct = Math.max(0, Math.min(50, params.constraints.maxSlopePct));
    }
    if (params.constraints.bufferTimeMin) {
        params.constraints.bufferTimeMin = Math.max(0, Math.min(120, params.constraints.bufferTimeMin));
    }
    return params;
}
//# sourceMappingURL=decision-params.interface.js.map