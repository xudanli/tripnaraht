"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrailDifficultyAssessor = void 0;
const trail_difficulty_interface_1 = require("../interfaces/trail-difficulty.interface");
class TrailDifficultyAssessor {
    static assess(metadata, options) {
        const base = this.assessBase(metadata);
        if (!base) {
            return null;
        }
        if (options === null || options === void 0 ? void 0 : options.season) {
            base.seasonalModifier = this.getSeasonalModifier(base, options.season);
            if (base.seasonalModifier) {
                base.level = this.applyModifier(base.level, base.seasonalModifier.modifier);
            }
        }
        if (options === null || options === void 0 ? void 0 : options.userExperience) {
            const experienceMod = this.getExperienceModifier(options.userExperience);
            if (experienceMod.modifier !== 0) {
                base.level = this.applyModifier(base.level, experienceMod.modifier);
                base.explanations = base.explanations || [];
                base.explanations.push(experienceMod.reason);
            }
        }
        base.explanations = this.generateExplanations(base);
        return base;
    }
    static assessBase(metadata) {
        const highRiskLevel = this.checkHighRiskTriggers(metadata);
        if (highRiskLevel) {
            return highRiskLevel;
        }
        if (metadata.trailDifficulty) {
            return this.fromOfficialRating(metadata.trailDifficulty, metadata);
        }
        if (metadata.technicalGrade) {
            return this.fromTechnicalGrade(metadata.technicalGrade, metadata);
        }
        if (metadata.riskFactors && Array.isArray(metadata.riskFactors) && metadata.riskFactors.length > 0) {
            return this.fromRiskFactors(metadata.riskFactors, metadata);
        }
        if (metadata.subCategory) {
            return this.fromSubCategory(metadata.subCategory, metadata);
        }
        return null;
    }
    static checkHighRiskTriggers(metadata) {
        const riskFactors = [];
        let hasHighRisk = false;
        if (metadata.requiresRope || metadata.rope) {
            riskFactors.push('rope');
            hasHighRisk = true;
        }
        if (metadata.exposure || metadata.exposed) {
            riskFactors.push('exposure');
            hasHighRisk = true;
        }
        if (metadata.scramble || metadata.technical) {
            riskFactors.push('scramble');
            hasHighRisk = true;
        }
        if (metadata.cliff || metadata.steep) {
            riskFactors.push('cliff');
            hasHighRisk = true;
        }
        if (metadata.ice || metadata.icy) {
            riskFactors.push('ice');
            hasHighRisk = true;
        }
        if (metadata.looseRock || metadata.unstable) {
            riskFactors.push('loose_rock');
            hasHighRisk = true;
        }
        if (metadata.winterIce || metadata.snow) {
            riskFactors.push('winter_ice');
            hasHighRisk = true;
        }
        if (metadata.rainLoose || metadata.meltWater) {
            riskFactors.push('rain_loose');
            hasHighRisk = true;
        }
        if (hasHighRisk && !metadata.trailDifficulty && riskFactors.length >= 2) {
            return {
                level: trail_difficulty_interface_1.DIFFICULTY_LEVEL.EXTREME,
                riskFactors,
                requiresEquipment: true,
                requiresGuide: riskFactors.includes('rope') || riskFactors.includes('ice'),
                source: 'manual',
                confidence: 0.8,
                explanations: [
                    `检测到 ${riskFactors.length} 个高风险信号：${riskFactors.join('、')}`,
                    '存在技术门槛或不可逆地形风险',
                ],
            };
        }
        return null;
    }
    static fromOfficialRating(rating, metadata) {
        const upper = rating.toUpperCase();
        let level;
        if (upper.includes('EASY') || upper === 'EASY' || upper === '1' || upper === '⭐') {
            level = trail_difficulty_interface_1.DIFFICULTY_LEVEL.EASY;
        }
        else if (upper.includes('MODERATE') || upper === 'MODERATE' || upper === '2' || upper === '⭐⭐') {
            level = trail_difficulty_interface_1.DIFFICULTY_LEVEL.MODERATE;
        }
        else if (upper.includes('HARD') || upper === 'HARD' || upper === '3' || upper === '⭐⭐⭐') {
            level = trail_difficulty_interface_1.DIFFICULTY_LEVEL.HARD;
        }
        else if (upper.includes('EXTREME') || upper === 'EXTREME' || upper === '4' || upper === '5' || upper === '⭐⭐⭐⭐' || upper === '⭐⭐⭐⭐⭐') {
            level = trail_difficulty_interface_1.DIFFICULTY_LEVEL.EXTREME;
        }
        else {
            level = trail_difficulty_interface_1.DIFFICULTY_LEVEL.MODERATE;
        }
        return {
            level,
            source: metadata.source || 'official',
            confidence: 0.9,
            requiresEquipment: metadata.requiresEquipment,
            requiresGuide: metadata.requiresGuide,
            riskFactors: this.extractRiskFactors(metadata),
            explanations: [
                `官方/专业平台评级：${trail_difficulty_interface_1.DIFFICULTY_SEMANTICS[level].stars}`,
                trail_difficulty_interface_1.DIFFICULTY_SEMANTICS[level].meaning,
            ],
        };
    }
    static fromTechnicalGrade(grade, metadata) {
        let level;
        if (grade <= 1) {
            level = trail_difficulty_interface_1.DIFFICULTY_LEVEL.EASY;
        }
        else if (grade <= 2) {
            level = trail_difficulty_interface_1.DIFFICULTY_LEVEL.MODERATE;
        }
        else if (grade <= 3) {
            level = trail_difficulty_interface_1.DIFFICULTY_LEVEL.HARD;
        }
        else {
            level = trail_difficulty_interface_1.DIFFICULTY_LEVEL.EXTREME;
        }
        return {
            level,
            technicalGrade: grade,
            source: metadata.source || 'technical',
            confidence: 0.8,
            requiresEquipment: grade >= 3,
            requiresGuide: grade >= 4,
            riskFactors: this.extractRiskFactors(metadata),
            explanations: [
                `技术等级：${grade}/5`,
                grade >= 4 ? '需要专业装备和向导' : grade >= 3 ? '需要专业装备' : '基础装备即可',
            ],
        };
    }
    static fromRiskFactors(riskFactors, metadata) {
        const factors = riskFactors.map(f => f.toLowerCase());
        const highRisk = ['exposure', 'rope', 'ice', 'cliff', 'scramble'];
        const hasHighRisk = factors.some(f => highRisk.includes(f));
        const mediumRisk = ['loose_rock', 'unstable', 'technical'];
        const hasMediumRisk = factors.some(f => mediumRisk.includes(f));
        let level;
        if (hasHighRisk || factors.length >= 3) {
            level = trail_difficulty_interface_1.DIFFICULTY_LEVEL.EXTREME;
        }
        else if (hasMediumRisk || factors.length >= 2) {
            level = trail_difficulty_interface_1.DIFFICULTY_LEVEL.HARD;
        }
        else {
            level = trail_difficulty_interface_1.DIFFICULTY_LEVEL.MODERATE;
        }
        return {
            level,
            riskFactors: factors,
            source: metadata.source || 'risk_assessment',
            confidence: 0.7,
            requiresEquipment: hasHighRisk,
            requiresGuide: factors.includes('rope') || factors.includes('ice'),
            explanations: [
                `风险因素：${factors.join('、')}`,
                hasHighRisk ? '存在高风险路段，需要专业装备' : '存在中等风险，需要经验判断',
            ],
        };
    }
    static fromSubCategory(subCategory, metadata) {
        const lower = subCategory.toLowerCase();
        if (lower.includes('volcano') || lower.includes('glacier') || lower.includes('climbing')) {
            return {
                level: trail_difficulty_interface_1.DIFFICULTY_LEVEL.EXTREME,
                source: 'manual',
                confidence: 0.5,
                requiresEquipment: true,
                requiresGuide: lower.includes('glacier'),
                riskFactors: ['exposure', 'technical'],
                explanations: [
                    `子类别：${subCategory}`,
                    '火山/冰川/攀爬类活动通常需要专业装备和向导',
                ],
            };
        }
        if (lower.includes('canyon') || lower.includes('waterfall') || lower.includes('cave')) {
            return {
                level: trail_difficulty_interface_1.DIFFICULTY_LEVEL.HARD,
                source: 'manual',
                confidence: 0.4,
                explanations: [
                    `子类别：${subCategory}`,
                    '峡谷/瀑布/洞穴类活动需要经验判断',
                ],
            };
        }
        return {
            level: trail_difficulty_interface_1.DIFFICULTY_LEVEL.EASY,
            source: 'manual',
            confidence: 0.3,
            explanations: [
                `子类别：${subCategory}`,
                '基于子类别的推断，置信度较低',
            ],
        };
    }
    static extractRiskFactors(metadata) {
        const factors = [];
        if (metadata.rope || metadata.requiresRope)
            factors.push('rope');
        if (metadata.exposure || metadata.exposed)
            factors.push('exposure');
        if (metadata.scramble || metadata.technical)
            factors.push('scramble');
        if (metadata.cliff || metadata.steep)
            factors.push('cliff');
        if (metadata.ice || metadata.icy)
            factors.push('ice');
        if (metadata.looseRock || metadata.unstable)
            factors.push('loose_rock');
        if (metadata.winterIce || metadata.snow)
            factors.push('winter_ice');
        if (metadata.rainLoose || metadata.meltWater)
            factors.push('rain_loose');
        return factors;
    }
    static getSeasonalModifier(base, season) {
        var _a, _b, _c, _d, _e;
        const hasSeasonalRisk = (_a = base.riskFactors) === null || _a === void 0 ? void 0 : _a.some(f => f === 'winter_ice' || f === 'rain_loose' || f === 'snow' || f === 'melt_water');
        if (!hasSeasonalRisk) {
            return null;
        }
        let modifier = 0;
        let reason = '';
        if (season === 'winter') {
            if (((_b = base.riskFactors) === null || _b === void 0 ? void 0 : _b.includes('winter_ice')) || ((_c = base.riskFactors) === null || _c === void 0 ? void 0 : _c.includes('snow'))) {
                modifier = +1;
                reason = '冬季结冰，失足风险高';
            }
        }
        else if (season === 'spring') {
            if (((_d = base.riskFactors) === null || _d === void 0 ? void 0 : _d.includes('rain_loose')) || ((_e = base.riskFactors) === null || _e === void 0 ? void 0 : _e.includes('melt_water'))) {
                modifier = +1;
                reason = '雨季碎石松动，融水增加风险';
            }
        }
        if (modifier === 0) {
            return null;
        }
        return {
            season,
            modifier,
            reason,
        };
    }
    static getExperienceModifier(experience) {
        const modifierMap = {
            beginner: {
                modifier: +1,
                reason: '新手用户：难度提升 1 星（更保守）',
            },
            intermediate: {
                modifier: 0,
                reason: '中级用户：难度不变',
            },
            advanced: {
                modifier: -0.5,
                reason: '高级用户：难度降低 0.5 星',
            },
            expert: {
                modifier: -1,
                reason: '专家用户：难度降低 1 星',
            },
        };
        const config = modifierMap[experience];
        return {
            experience,
            modifier: config.modifier,
            reason: config.reason,
        };
    }
    static applyModifier(level, modifier) {
        const levels = [
            trail_difficulty_interface_1.DIFFICULTY_LEVEL.EASY,
            trail_difficulty_interface_1.DIFFICULTY_LEVEL.MODERATE,
            trail_difficulty_interface_1.DIFFICULTY_LEVEL.HARD,
            trail_difficulty_interface_1.DIFFICULTY_LEVEL.EXTREME,
        ];
        const currentIndex = levels.indexOf(level);
        const newIndex = Math.max(0, Math.min(levels.length - 1, currentIndex + Math.round(modifier)));
        return levels[newIndex];
    }
    static generateExplanations(metadata) {
        const explanations = [];
        const semantics = trail_difficulty_interface_1.DIFFICULTY_SEMANTICS[metadata.level];
        explanations.push(`${semantics.stars} ${semantics.meaning}`);
        if (metadata.riskFactors && metadata.riskFactors.length > 0) {
            const riskNames = {
                scramble: '攀爬路段',
                rope: '需要绳索',
                exposure: '暴露感强（悬崖路段）',
                technical: '技术路段',
                cliff: '陡崖',
                ice: '冰雪',
                loose_rock: '碎石',
                unstable: '不稳定地形',
                winter_ice: '冬季结冰',
                rain_loose: '雨季碎石松动',
                snow: '雪',
                melt_water: '融水',
            };
            const riskDescriptions = metadata.riskFactors
                .map(f => riskNames[f] || f)
                .join('、');
            explanations.push(`风险因素：${riskDescriptions}`);
        }
        if (metadata.requiresEquipment) {
            explanations.push('需要专业装备');
        }
        if (metadata.requiresGuide) {
            explanations.push('建议向导陪同');
        }
        if (metadata.seasonalModifier && metadata.seasonalModifier.modifier > 0) {
            explanations.push(`季节修正：${metadata.seasonalModifier.reason}`);
        }
        return explanations;
    }
}
exports.TrailDifficultyAssessor = TrailDifficultyAssessor;
//# sourceMappingURL=trail-difficulty-assessor.util.js.map