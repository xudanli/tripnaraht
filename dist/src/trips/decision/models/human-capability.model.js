"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHumanCapabilityModelFromProfile = createHumanCapabilityModelFromProfile;
exports.projectToDecisionParams = projectToDecisionParams;
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
    };
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
//# sourceMappingURL=human-capability.model.js.map