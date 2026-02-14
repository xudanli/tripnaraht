"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateAgeModifier = calculateAgeModifier;
exports.ageGroupToMidAge = ageGroupToMidAge;
exports.questionnaireScoreToFitnessLevel = questionnaireScoreToFitnessLevel;
exports.fitnessLevelToBaseAscent = fitnessLevelToBaseAscent;
exports.calculateConfidenceLevel = calculateConfidenceLevel;
exports.createHumanCapabilityModelFromProfile = createHumanCapabilityModelFromProfile;
exports.createHumanCapabilityModelFromQuestionnaire = createHumanCapabilityModelFromQuestionnaire;
exports.calculateQuestionnaireScore = calculateQuestionnaireScore;
exports.calibrateModelFromFeedback = calibrateModelFromFeedback;
exports.projectToDecisionParams = projectToDecisionParams;
exports.getAcclimatizationRules = getAcclimatizationRules;
exports.calculateAcclimatizationEfficiency = calculateAcclimatizationEfficiency;
exports.calculateRequiredAcclimatizationDays = calculateRequiredAcclimatizationDays;
exports.updateAcclimatizationState = updateAcclimatizationState;
exports.checkAltitudeChangeSafety = checkAltitudeChangeSafety;
function calculateAgeModifier(age) {
    if (age <= 25)
        return 1.0;
    if (age <= 35)
        return 0.95;
    if (age <= 45)
        return 0.90;
    if (age <= 55)
        return 0.80;
    if (age <= 65)
        return 0.70;
    return 0.60;
}
function ageGroupToMidAge(ageGroup) {
    const mapping = {
        '18-29': 24,
        '30-39': 35,
        '40-49': 45,
        '50-59': 55,
        '60+': 65,
    };
    return mapping[ageGroup];
}
function questionnaireScoreToFitnessLevel(score) {
    if (score < 30)
        return 'LOW';
    if (score < 45)
        return 'MEDIUM_LOW';
    if (score < 60)
        return 'MEDIUM';
    if (score < 80)
        return 'MEDIUM_HIGH';
    return 'HIGH';
}
function fitnessLevelToBaseAscent(level) {
    const mapping = {
        'LOW': { maxDailyAscentM: 400, rollingAscent3DaysM: 1000, maxSlopePct: 15 },
        'MEDIUM_LOW': { maxDailyAscentM: 600, rollingAscent3DaysM: 1500, maxSlopePct: 20 },
        'MEDIUM': { maxDailyAscentM: 800, rollingAscent3DaysM: 2000, maxSlopePct: 25 },
        'MEDIUM_HIGH': { maxDailyAscentM: 1000, rollingAscent3DaysM: 2600, maxSlopePct: 28 },
        'HIGH': { maxDailyAscentM: 1200, rollingAscent3DaysM: 3300, maxSlopePct: 30 },
    };
    return mapping[level];
}
function calculateConfidenceLevel(tripCount, source) {
    if (source === 'WEARABLE')
        return 'HIGH';
    if (source === 'HISTORICAL' && tripCount >= 3)
        return 'HIGH';
    if (source === 'HISTORICAL' && tripCount >= 1)
        return 'MEDIUM';
    if (source === 'FIRST_DAY_TEST')
        return 'MEDIUM';
    if (source === 'QUESTIONNAIRE')
        return 'MEDIUM';
    return 'LOW';
}
function createHumanCapabilityModelFromProfile(profileId, keywords) {
    const pace = keywords.pace || 'normal';
    const fitness = keywords.fitness || 'medium';
    const riskTolerance = keywords.riskTolerance || 'medium';
    const altitudeExp = keywords.highAltitudeExperience || 'none';
    let preferredPace = 'MEDIUM';
    if (pace === 'slow' || pace === 'relaxed') {
        preferredPace = 'SLOW';
    }
    else if (pace === 'fast' || pace === 'intense') {
        preferredPace = 'FAST';
    }
    let maxDailyAscentM = 800;
    let rollingAscent3DaysM = 2000;
    let maxSlopePct = 25;
    if (fitness === 'low') {
        maxDailyAscentM = 400;
        rollingAscent3DaysM = 1000;
        maxSlopePct = 15;
    }
    else if (fitness === 'high' || fitness === 'extreme') {
        maxDailyAscentM = 1200;
        rollingAscent3DaysM = 3000;
        maxSlopePct = 30;
    }
    let riskToleranceLevel = 'MEDIUM';
    if (riskTolerance === 'low') {
        riskToleranceLevel = 'LOW';
    }
    else if (riskTolerance === 'high') {
        riskToleranceLevel = 'HIGH';
    }
    let highAltitudeExp = 'NONE';
    if (altitudeExp === 'basic') {
        highAltitudeExp = 'BASIC';
    }
    else if (altitudeExp === 'advanced') {
        highAltitudeExp = 'ADVANCED';
    }
    let maxElevationM;
    let requiresGradualAscent = false;
    if (highAltitudeExp === 'NONE') {
        maxElevationM = 3000;
        requiresGradualAscent = true;
    }
    else if (highAltitudeExp === 'BASIC') {
        maxElevationM = 4500;
        requiresGradualAscent = true;
    }
    else if (highAltitudeExp === 'ADVANCED') {
        maxElevationM = 6000;
        requiresGradualAscent = false;
    }
    let bufferDayBias = 'MEDIUM';
    if (preferredPace === 'SLOW' || fitness === 'low') {
        bufferDayBias = 'HIGH';
    }
    else if (preferredPace === 'FAST' && fitness === 'high') {
        bufferDayBias = 'LOW';
    }
    let weatherRiskWeight = 0.5;
    if (riskToleranceLevel === 'LOW') {
        weatherRiskWeight = 0.7;
    }
    else if (riskToleranceLevel === 'HIGH') {
        weatherRiskWeight = 0.3;
    }
    return {
        profileId,
        maxDailyAscentM,
        rollingAscent3DaysM,
        maxSlopePct,
        preferredPace,
        riskTolerance: riskToleranceLevel,
        highAltitudeExperience: highAltitudeExp,
        maxElevationM,
        requiresGradualAscent,
        bufferDayBias,
        weatherRiskWeight,
        assessmentSource: 'USER_SELF_REPORT',
        confidenceLevel: 'LOW',
    };
}
function createHumanCapabilityModelFromQuestionnaire(profileId, questionnaire, options) {
    const fitnessScore = calculateQuestionnaireScore(questionnaire);
    const fitnessLevel = questionnaireScoreToFitnessLevel(fitnessScore);
    const baseCapacity = fitnessLevelToBaseAscent(fitnessLevel);
    const midAge = ageGroupToMidAge(questionnaire.ageGroup);
    const ageModifier = calculateAgeModifier(midAge);
    const maxDailyAscentM = Math.round(baseCapacity.maxDailyAscentM * ageModifier);
    const rollingAscent3DaysM = Math.round(baseCapacity.rollingAscent3DaysM * ageModifier);
    const riskTolerance = (options === null || options === void 0 ? void 0 : options.riskTolerance) || 'medium';
    const altitudeExp = (options === null || options === void 0 ? void 0 : options.highAltitudeExperience) || 'none';
    const pace = (options === null || options === void 0 ? void 0 : options.pace) || 'normal';
    let preferredPace = 'MEDIUM';
    if (pace === 'slow' || pace === 'relaxed') {
        preferredPace = 'SLOW';
    }
    else if (pace === 'fast' || pace === 'intense') {
        preferredPace = 'FAST';
    }
    let riskToleranceLevel = 'MEDIUM';
    if (riskTolerance === 'low') {
        riskToleranceLevel = 'LOW';
    }
    else if (riskTolerance === 'high') {
        riskToleranceLevel = 'HIGH';
    }
    let highAltitudeExp = 'NONE';
    let maxElevationM;
    let requiresGradualAscent = false;
    if (altitudeExp === 'basic') {
        highAltitudeExp = 'BASIC';
        maxElevationM = 4500;
        requiresGradualAscent = true;
    }
    else if (altitudeExp === 'advanced') {
        highAltitudeExp = 'ADVANCED';
        maxElevationM = 6000;
        requiresGradualAscent = false;
    }
    else {
        maxElevationM = 3000;
        requiresGradualAscent = true;
    }
    let bufferDayBias = 'MEDIUM';
    if (preferredPace === 'SLOW' || fitnessLevel === 'LOW' || fitnessLevel === 'MEDIUM_LOW') {
        bufferDayBias = 'HIGH';
    }
    else if (preferredPace === 'FAST' && (fitnessLevel === 'HIGH' || fitnessLevel === 'MEDIUM_HIGH')) {
        bufferDayBias = 'LOW';
    }
    let weatherRiskWeight = 0.5;
    if (riskToleranceLevel === 'LOW') {
        weatherRiskWeight = 0.7;
    }
    else if (riskToleranceLevel === 'HIGH') {
        weatherRiskWeight = 0.3;
    }
    const completedTripCount = (options === null || options === void 0 ? void 0 : options.completedTripCount) || 0;
    const confidenceLevel = calculateConfidenceLevel(completedTripCount, 'QUESTIONNAIRE');
    return {
        profileId,
        maxDailyAscentM,
        rollingAscent3DaysM,
        maxSlopePct: baseCapacity.maxSlopePct,
        preferredPace,
        riskTolerance: riskToleranceLevel,
        highAltitudeExperience: highAltitudeExp,
        maxElevationM,
        requiresGradualAscent,
        bufferDayBias,
        weatherRiskWeight,
        age: midAge,
        ageGroup: questionnaire.ageGroup,
        ageModifier,
        fitnessScore,
        fitnessLevel,
        assessmentSource: 'QUESTIONNAIRE',
        confidenceLevel,
        completedTripCount,
    };
}
function calculateQuestionnaireScore(answers) {
    const weeklyExerciseScore = answers.weeklyExercise * 25;
    const longestHikeScore = answers.longestHike * 25;
    const elevationScore = answers.elevationExperience * 25;
    const totalScore = weeklyExerciseScore * 0.30 +
        longestHikeScore * 0.35 +
        elevationScore * 0.35;
    return Math.round(totalScore);
}
function calibrateModelFromFeedback(currentModel, feedbacks) {
    if (feedbacks.length === 0) {
        return currentModel;
    }
    let totalBias = 0;
    for (const feedback of feedbacks) {
        if (feedback.actualEffortRating === 1) {
            totalBias -= 0.20;
        }
        else if (feedback.actualEffortRating === 3) {
            totalBias += 0.15;
        }
    }
    const avgBias = totalBias / feedbacks.length;
    const adjustmentFactor = Math.max(0.80, Math.min(1.20, 1 + avgBias));
    const newCalibrationRecord = {
        date: new Date(),
        factor: adjustmentFactor,
        feedbackCount: feedbacks.length,
        source: 'HISTORICAL',
    };
    const calibratedModel = {
        ...currentModel,
        maxDailyAscentM: Math.round(currentModel.maxDailyAscentM * adjustmentFactor),
        rollingAscent3DaysM: Math.round(currentModel.rollingAscent3DaysM * adjustmentFactor),
        assessmentSource: 'HISTORICAL',
        confidenceLevel: calculateConfidenceLevel((currentModel.completedTripCount || 0) + feedbacks.length, 'HISTORICAL'),
        completedTripCount: (currentModel.completedTripCount || 0) + feedbacks.length,
        calibrationHistory: [
            ...(currentModel.calibrationHistory || []),
            newCalibrationRecord,
        ],
    };
    return calibratedModel;
}
function projectToDecisionParams(model) {
    return {
        maxDailyAscentM: model.maxDailyAscentM,
        rollingAscent3DaysM: model.rollingAscent3DaysM,
        maxSlopePct: model.maxSlopePct,
        weatherRiskWeight: model.weatherRiskWeight || 0.5,
        bufferDayBias: model.bufferDayBias || 'MEDIUM',
        riskTolerance: model.riskTolerance,
    };
}
function getAcclimatizationRules() {
    return [
        {
            altitudeThresholdM: 2500,
            metersPerAcclimatizationDay: 500,
            maxDailySleepingAltitudeGainM: 500,
        },
        {
            altitudeThresholdM: 3000,
            metersPerAcclimatizationDay: 300,
            maxDailySleepingAltitudeGainM: 400,
        },
        {
            altitudeThresholdM: 4000,
            metersPerAcclimatizationDay: 200,
            maxDailySleepingAltitudeGainM: 300,
        },
        {
            altitudeThresholdM: 5000,
            metersPerAcclimatizationDay: 150,
            maxDailySleepingAltitudeGainM: 200,
        },
    ];
}
function calculateAcclimatizationEfficiency(model) {
    let efficiency = 1.0;
    const ageModifier = model.ageModifier || calculateAgeModifier(model.age || 35);
    efficiency *= 0.8 + ageModifier * 0.3;
    const fitnessModifier = {
        'LOW': 0.85,
        'MEDIUM_LOW': 0.92,
        'MEDIUM': 1.0,
        'MEDIUM_HIGH': 1.05,
        'HIGH': 1.1,
    };
    efficiency *= fitnessModifier[model.fitnessLevel || 'MEDIUM'];
    const experienceModifier = {
        'NONE': 0.85,
        'BASIC': 1.0,
        'ADVANCED': 1.15,
    };
    efficiency *= experienceModifier[model.highAltitudeExperience];
    if (model.amsSensitivity) {
        const sensitivityModifier = {
            'LOW': 1.1,
            'MEDIUM': 1.0,
            'HIGH': 0.8,
        };
        efficiency *= sensitivityModifier[model.amsSensitivity];
    }
    if (model.acclimatizationRateModifier) {
        efficiency *= model.acclimatizationRateModifier;
    }
    return Math.max(0.6, Math.min(1.2, efficiency));
}
function calculateRequiredAcclimatizationDays(currentAltitudeM, targetAltitudeM, efficiency = 1.0) {
    var _a;
    if (targetAltitudeM <= currentAltitudeM) {
        return 0;
    }
    const rules = getAcclimatizationRules();
    let totalDays = 0;
    let altitude = Math.max(currentAltitudeM, 2500);
    if (targetAltitudeM <= 2500) {
        return 0;
    }
    while (altitude < targetAltitudeM) {
        const rule = rules
            .filter(r => altitude >= r.altitudeThresholdM)
            .sort((a, b) => b.altitudeThresholdM - a.altitudeThresholdM)[0]
            || rules[0];
        const nextThreshold = (_a = rules.find(r => r.altitudeThresholdM > altitude)) === null || _a === void 0 ? void 0 : _a.altitudeThresholdM;
        const segmentEnd = Math.min(targetAltitudeM, nextThreshold || Infinity);
        const segmentGain = segmentEnd - altitude;
        const baseDays = segmentGain / rule.metersPerAcclimatizationDay;
        totalDays += baseDays / efficiency;
        altitude = segmentEnd;
    }
    return Math.ceil(totalDays);
}
function updateAcclimatizationState(currentState, todaySleepingAltitudeM, efficiency = 1.0) {
    const state = currentState || {
        acclimatizedAltitudeM: 0,
        daysAtCurrentAltitude: 0,
        totalAcclimatizationDays: 0,
        acclimatizationEfficiency: efficiency,
    };
    if (todaySleepingAltitudeM < 2500) {
        const newAcclimatizedAltitude = Math.max(0, state.acclimatizedAltitudeM - 200);
        return {
            ...state,
            acclimatizedAltitudeM: newAcclimatizedAltitude,
            daysAtCurrentAltitude: 0,
            lastAltitudeChangeDate: new Date(),
        };
    }
    const altitudeChange = todaySleepingAltitudeM - state.acclimatizedAltitudeM;
    if (altitudeChange <= 0) {
        return {
            ...state,
            daysAtCurrentAltitude: state.daysAtCurrentAltitude + 1,
            totalAcclimatizationDays: state.totalAcclimatizationDays + 1,
            lastAltitudeChangeDate: new Date(),
        };
    }
    const rules = getAcclimatizationRules();
    const applicableRule = rules
        .filter(r => todaySleepingAltitudeM >= r.altitudeThresholdM)
        .sort((a, b) => b.altitudeThresholdM - a.altitudeThresholdM)[0]
        || rules[0];
    const dailyAdaptation = applicableRule.metersPerAcclimatizationDay * efficiency;
    const newAcclimatizedAltitude = Math.min(todaySleepingAltitudeM, state.acclimatizedAltitudeM + dailyAdaptation);
    const hasRisk = altitudeChange > applicableRule.maxDailySleepingAltitudeGainM;
    return {
        acclimatizedAltitudeM: Math.round(newAcclimatizedAltitude),
        daysAtCurrentAltitude: 1,
        totalAcclimatizationDays: state.totalAcclimatizationDays + 1,
        acclimatizationEfficiency: efficiency,
        hasAMSSymptoms: hasRisk ? true : state.hasAMSSymptoms,
        lastAltitudeChangeDate: new Date(),
    };
}
function checkAltitudeChangeSafety(currentAcclimatizedAltitudeM, targetSleepingAltitudeM, model) {
    const warnings = [];
    const recommendations = [];
    let riskLevel = 'NONE';
    const rules = getAcclimatizationRules();
    const applicableRule = rules
        .filter(r => targetSleepingAltitudeM >= r.altitudeThresholdM)
        .sort((a, b) => b.altitudeThresholdM - a.altitudeThresholdM)[0];
    if (!applicableRule) {
        return { isSafe: true, riskLevel: 'NONE', warnings, recommendations };
    }
    const altitudeGain = targetSleepingAltitudeM - currentAcclimatizedAltitudeM;
    if (altitudeGain > applicableRule.maxDailySleepingAltitudeGainM) {
        const excess = altitudeGain - applicableRule.maxDailySleepingAltitudeGainM;
        if (excess > 500) {
            riskLevel = 'CRITICAL';
            warnings.push(`海拔增益过大（${altitudeGain}m），严重高反风险`);
            recommendations.push('建议分多天上升，或增加适应日');
        }
        else if (excess > 300) {
            riskLevel = 'HIGH';
            warnings.push(`海拔增益较大（${altitudeGain}m），高反风险较高`);
            recommendations.push('建议增加1天适应');
        }
        else {
            riskLevel = riskLevel === 'NONE' ? 'MEDIUM' : riskLevel;
            warnings.push(`海拔增益略高（${altitudeGain}m）`);
            recommendations.push('注意观察高反症状');
        }
    }
    if (model.maxElevationM && targetSleepingAltitudeM > model.maxElevationM) {
        riskLevel = 'CRITICAL';
        warnings.push(`超过用户最大安全海拔（${model.maxElevationM}m）`);
        recommendations.push('不建议前往该海拔');
    }
    if (model.highAltitudeExperience === 'NONE' && targetSleepingAltitudeM > 3500) {
        if (['NONE', 'LOW'].includes(riskLevel)) {
            riskLevel = 'MEDIUM';
        }
        warnings.push('无高海拔经验，超过3500m存在风险');
        recommendations.push('建议进行高海拔适应训练');
    }
    if (model.amsSensitivity === 'HIGH' && altitudeGain > 200) {
        if (riskLevel === 'NONE') {
            riskLevel = 'MEDIUM';
        }
        warnings.push('高反敏感体质，需要更慢的上升速度');
        recommendations.push('建议每天海拔增益不超过200m');
    }
    const isSafe = ['NONE', 'LOW'].includes(riskLevel);
    return { isSafe, riskLevel, warnings, recommendations };
}
//# sourceMappingURL=human-capability.model.js.map