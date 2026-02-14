"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PersonaIdentificationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersonaIdentificationService = void 0;
const common_1 = require("@nestjs/common");
let PersonaIdentificationService = PersonaIdentificationService_1 = class PersonaIdentificationService {
    constructor() {
        this.logger = new common_1.Logger(PersonaIdentificationService_1.name);
    }
    async identifyCurrentPersona(userProfile, currentContext) {
        if ('personas' in userProfile && userProfile.personas.length > 0) {
            return this.selectBestMatchingPersona(userProfile.personas, currentContext);
        }
        return this.createPersonaFromProfile(userProfile, currentContext);
    }
    detectPersonaChange(oldPersona, newSignals) {
        const changes = [];
        let changeMagnitude = 0;
        let changeType = 'GRADUAL';
        if (newSignals.physical) {
            const physicalChanges = this.detectPhysicalChanges(oldPersona.currentState.physical, newSignals.physical);
            if (physicalChanges.hasChanged) {
                changes.push(...physicalChanges.reasons);
                changeMagnitude = Math.max(changeMagnitude, physicalChanges.magnitude);
            }
        }
        if (newSignals.psychological) {
            const psychologicalChanges = this.detectPsychologicalChanges(oldPersona.currentState.psychological, newSignals.psychological);
            if (psychologicalChanges.hasChanged) {
                changes.push(...psychologicalChanges.reasons);
                changeMagnitude = Math.max(changeMagnitude, psychologicalChanges.magnitude);
            }
        }
        if (newSignals.temporal) {
            const temporalChanges = this.detectTemporalChanges(oldPersona.currentState.temporal, newSignals.temporal);
            if (temporalChanges.hasChanged) {
                changes.push(...temporalChanges.reasons);
                changeMagnitude = Math.max(changeMagnitude, temporalChanges.magnitude);
            }
        }
        if (newSignals.preferences) {
            const preferenceChanges = this.detectPreferenceChanges(oldPersona.preferences, newSignals.preferences);
            if (preferenceChanges.hasChanged) {
                changes.push(...preferenceChanges.reasons);
                changeMagnitude = Math.max(changeMagnitude, preferenceChanges.magnitude);
            }
        }
        if (changeMagnitude > 0.7) {
            changeType = 'ABRUPT';
        }
        else if (changeMagnitude > 0.3) {
            changeType = 'GRADUAL';
        }
        else {
            changeType = 'TEMPORARY';
        }
        const hasChanged = changes.length > 0 && changeMagnitude > 0.2;
        let newPersona;
        if (hasChanged && changeMagnitude > 0.5) {
            newPersona = this.createUpdatedPersona(oldPersona, newSignals);
        }
        return {
            hasChanged,
            changeType,
            changeMagnitude,
            changeReasons: changes,
            newPersona,
        };
    }
    async createOrUpdatePersona(userProfile, personaName, context, signals) {
        const existingPersona = userProfile.personas.find(p => p.personaName === personaName);
        if (existingPersona && signals) {
            return this.updatePersona(existingPersona, signals);
        }
        else if (existingPersona) {
            return existingPersona;
        }
        else {
            return this.createNewPersona(personaName, context, userProfile.baseProfile);
        }
    }
    getBestMatchingPersona(userProfile, context) {
        if (userProfile.personas.length === 0) {
            return null;
        }
        const { persona } = this.selectBestMatchingPersona(userProfile.personas, context);
        return persona;
    }
    selectBestMatchingPersona(personas, context) {
        let bestPersona = personas[0];
        let bestScore = 0;
        for (const persona of personas) {
            const score = this.calculatePersonaMatchScore(persona, context);
            if (score > bestScore) {
                bestScore = score;
                bestPersona = persona;
            }
        }
        return {
            persona: bestPersona,
            confidence: bestScore,
        };
    }
    calculatePersonaMatchScore(persona, context) {
        var _a, _b, _c;
        let score = 0;
        let factors = 0;
        if (((_a = context.situation) === null || _a === void 0 ? void 0 : _a.tripPurpose) && persona.tripType.includes(context.situation.tripPurpose)) {
            score += 0.3;
        }
        factors += 0.3;
        if ((_b = context.social) === null || _b === void 0 ? void 0 : _b.socialPreference) {
            const socialMatch = this.matchSocialPreference(persona, context.social.socialPreference);
            score += socialMatch * 0.2;
        }
        factors += 0.2;
        if ((_c = context.situation) === null || _c === void 0 ? void 0 : _c.constraints) {
            const timeMatch = this.matchTimeConstraints(persona, context.situation.constraints);
            score += timeMatch * 0.3;
        }
        factors += 0.3;
        score += Math.min(persona.usageCount / 10, 0.2);
        factors += 0.2;
        return factors > 0 ? score / factors : 0.5;
    }
    createPersonaFromProfile(userProfile, context) {
        var _a;
        const persona = {
            personaName: this.generatePersonaName(context),
            tripType: ((_a = context.situation) === null || _a === void 0 ? void 0 : _a.tripPurpose) || 'GENERAL',
            currentState: {
                physical: {
                    fitnessLevel: 5,
                    fatigueLevel: 0.3,
                    healthStatus: 'GOOD',
                },
                psychological: {
                    stressLevel: 0.3,
                    excitementLevel: 0.6,
                    confidenceLevel: 0.5,
                    mood: 'POSITIVE',
                },
                temporal: {
                    availableDays: 7,
                    timePressure: 0.3,
                    timeFlexibility: 'MEDIUM',
                    tripStage: 'PLANNING',
                },
            },
            preferences: {
                pacePreference: userProfile.pacePreference,
                altitudeTolerance: userProfile.altitudeTolerance,
                riskTolerance: userProfile.riskTolerance,
                travelPhilosophy: userProfile.travelPhilosophy,
                preferredRouteTypes: userProfile.preferredRouteTypes,
            },
            activityHistory: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            usageCount: 0,
            confidence: userProfile.confidence,
        };
        return {
            persona,
            confidence: userProfile.confidence,
        };
    }
    createNewPersona(personaName, context, baseProfile) {
        var _a;
        return {
            personaName,
            tripType: ((_a = context.situation) === null || _a === void 0 ? void 0 : _a.tripPurpose) || 'GENERAL',
            currentState: {
                physical: {
                    fitnessLevel: 5,
                    fatigueLevel: 0.3,
                    healthStatus: 'GOOD',
                },
                psychological: {
                    stressLevel: 0.3,
                    excitementLevel: 0.6,
                    confidenceLevel: 0.5,
                    mood: 'POSITIVE',
                },
                temporal: {
                    availableDays: 7,
                    timePressure: 0.3,
                    timeFlexibility: 'MEDIUM',
                    tripStage: 'PLANNING',
                },
            },
            preferences: {
                pacePreference: baseProfile.pacePreference,
                altitudeTolerance: baseProfile.altitudeTolerance,
                riskTolerance: baseProfile.riskTolerance,
                travelPhilosophy: baseProfile.travelPhilosophy,
                preferredRouteTypes: baseProfile.preferredRouteTypes,
            },
            activityHistory: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            usageCount: 0,
            confidence: 0.5,
        };
    }
    updatePersona(persona, signals) {
        const updated = {
            ...persona,
            currentState: {
                physical: {
                    ...persona.currentState.physical,
                    ...signals.physical,
                },
                psychological: {
                    ...persona.currentState.psychological,
                    ...signals.psychological,
                },
                temporal: {
                    ...persona.currentState.temporal,
                    ...signals.temporal,
                },
            },
            preferences: {
                ...persona.preferences,
                ...signals.preferences,
            },
            updatedAt: new Date(),
            usageCount: persona.usageCount + 1,
        };
        return updated;
    }
    createUpdatedPersona(oldPersona, signals) {
        return this.updatePersona(oldPersona, signals);
    }
    detectPhysicalChanges(oldState, newState) {
        const reasons = [];
        let magnitude = 0;
        if (newState.fitnessLevel !== undefined) {
            const diff = Math.abs(newState.fitnessLevel - oldState.fitnessLevel) / 10;
            if (diff > 0.2) {
                reasons.push('体力水平发生变化');
                magnitude = Math.max(magnitude, diff);
            }
        }
        if (newState.fatigueLevel !== undefined) {
            const diff = Math.abs(newState.fatigueLevel - oldState.fatigueLevel);
            if (diff > 0.2) {
                reasons.push('疲劳程度发生变化');
                magnitude = Math.max(magnitude, diff);
            }
        }
        if (newState.healthStatus && newState.healthStatus !== oldState.healthStatus) {
            reasons.push('健康状况发生变化');
            magnitude = Math.max(magnitude, 0.5);
        }
        return {
            hasChanged: reasons.length > 0,
            magnitude,
            reasons,
        };
    }
    detectPsychologicalChanges(oldState, newState) {
        const reasons = [];
        let magnitude = 0;
        if (newState.stressLevel !== undefined) {
            const diff = Math.abs(newState.stressLevel - oldState.stressLevel);
            if (diff > 0.2) {
                reasons.push('压力水平发生变化');
                magnitude = Math.max(magnitude, diff);
            }
        }
        if (newState.confidenceLevel !== undefined) {
            const diff = Math.abs(newState.confidenceLevel - oldState.confidenceLevel);
            if (diff > 0.2) {
                reasons.push('信心度发生变化');
                magnitude = Math.max(magnitude, diff);
            }
        }
        if (newState.mood && newState.mood !== oldState.mood) {
            reasons.push('情绪状态发生变化');
            magnitude = Math.max(magnitude, 0.4);
        }
        return {
            hasChanged: reasons.length > 0,
            magnitude,
            reasons,
        };
    }
    detectTemporalChanges(oldState, newState) {
        const reasons = [];
        let magnitude = 0;
        if (newState.availableDays !== undefined) {
            const diff = Math.abs(newState.availableDays - oldState.availableDays) / 30;
            if (diff > 0.2) {
                reasons.push('可用时间发生变化');
                magnitude = Math.max(magnitude, diff);
            }
        }
        if (newState.timePressure !== undefined) {
            const diff = Math.abs(newState.timePressure - oldState.timePressure);
            if (diff > 0.2) {
                reasons.push('时间紧迫度发生变化');
                magnitude = Math.max(magnitude, diff);
            }
        }
        if (newState.tripStage && newState.tripStage !== oldState.tripStage) {
            reasons.push('旅行阶段发生变化');
            magnitude = Math.max(magnitude, 0.3);
        }
        return {
            hasChanged: reasons.length > 0,
            magnitude,
            reasons,
        };
    }
    detectPreferenceChanges(oldPreferences, newPreferences) {
        const reasons = [];
        let magnitude = 0;
        if (newPreferences.pacePreference && newPreferences.pacePreference !== oldPreferences.pacePreference) {
            reasons.push('节奏偏好发生变化');
            magnitude = Math.max(magnitude, 0.3);
        }
        if (newPreferences.riskTolerance && newPreferences.riskTolerance !== oldPreferences.riskTolerance) {
            reasons.push('风险容忍度发生变化');
            magnitude = Math.max(magnitude, 0.4);
        }
        if (newPreferences.travelPhilosophy && newPreferences.travelPhilosophy !== oldPreferences.travelPhilosophy) {
            reasons.push('旅行哲学发生变化');
            magnitude = Math.max(magnitude, 0.5);
        }
        return {
            hasChanged: reasons.length > 0,
            magnitude,
            reasons,
        };
    }
    matchSocialPreference(persona, preference) {
        if (persona.personaName.includes('独自') && preference === 'SOLO') {
            return 1.0;
        }
        if (persona.personaName.includes('团体') && preference !== 'SOLO') {
            return 1.0;
        }
        return 0.5;
    }
    matchTimeConstraints(persona, constraints) {
        if (constraints.includes('时间紧张') && persona.currentState.temporal.timePressure > 0.5) {
            return 1.0;
        }
        if (constraints.includes('时间充足') && persona.currentState.temporal.timePressure < 0.3) {
            return 1.0;
        }
        return 0.5;
    }
    generatePersonaName(context) {
        var _a, _b, _c;
        const tripType = ((_a = context.situation) === null || _a === void 0 ? void 0 : _a.tripPurpose) || '旅行';
        const timeType = ((_c = (_b = context.situation) === null || _b === void 0 ? void 0 : _b.constraints) === null || _c === void 0 ? void 0 : _c.includes('时间紧张')) ? '紧凑' : '轻松';
        return `${timeType}${tripType}人格`;
    }
};
exports.PersonaIdentificationService = PersonaIdentificationService;
exports.PersonaIdentificationService = PersonaIdentificationService = PersonaIdentificationService_1 = __decorate([
    (0, common_1.Injectable)()
], PersonaIdentificationService);
//# sourceMappingURL=persona-identification.service.js.map