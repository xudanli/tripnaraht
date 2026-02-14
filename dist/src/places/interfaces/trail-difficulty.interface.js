"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXPERIENCE_MODIFIER = exports.DIFFICULTY_FATIGUE_MODIFIER = exports.DIFFICULTY_SEMANTICS = exports.DIFFICULTY_LEVEL = void 0;
exports.DIFFICULTY_LEVEL = {
    EASY: 'EASY',
    MODERATE: 'MODERATE',
    HARD: 'HARD',
    EXTREME: 'EXTREME',
};
exports.DIFFICULTY_SEMANTICS = {
    [exports.DIFFICULTY_LEVEL.EASY]: {
        stars: '⭐',
        meaning: '几乎无风险，新手可随时撤退',
        riskLevel: 'low',
    },
    [exports.DIFFICULTY_LEVEL.MODERATE]: {
        stars: '⭐⭐',
        meaning: '有地形变化，但直觉可应对',
        riskLevel: 'medium',
    },
    [exports.DIFFICULTY_LEVEL.HARD]: {
        stars: '⭐⭐⭐',
        meaning: '需要经验判断，错误会不舒服',
        riskLevel: 'high',
    },
    [exports.DIFFICULTY_LEVEL.EXTREME]: {
        stars: '⭐⭐⭐⭐ / ⭐⭐⭐⭐⭐',
        meaning: '错误可能导致严重后果（fall / lost / exposure）',
        riskLevel: 'extreme',
    },
};
exports.DIFFICULTY_FATIGUE_MODIFIER = {
    [exports.DIFFICULTY_LEVEL.EASY]: 0.95,
    [exports.DIFFICULTY_LEVEL.MODERATE]: 1.0,
    [exports.DIFFICULTY_LEVEL.HARD]: 1.1,
    [exports.DIFFICULTY_LEVEL.EXTREME]: 1.15,
};
exports.EXPERIENCE_MODIFIER = {
    beginner: +1,
    intermediate: 0,
    advanced: -0.5,
    expert: -1,
};
//# sourceMappingURL=trail-difficulty.interface.js.map