"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ExperienceAgentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExperienceAgentService = void 0;
const common_1 = require("@nestjs/common");
let ExperienceAgentService = ExperienceAgentService_1 = class ExperienceAgentService {
    constructor() {
        this.logger = new common_1.Logger(ExperienceAgentService_1.name);
        this.logger.log('[ExperienceAgent] Initialized');
    }
    async analyzeExperienceDensity(itinerary) {
        var _a, _b, _c;
        const evidence = [];
        const densityCurve = [];
        const peakExperiences = [];
        const lowPoints = [];
        let totalExp = 0;
        const expTypes = new Set();
        if (itinerary.days) {
            for (const day of itinerary.days) {
                let dayDensity = 0;
                if (day.items) {
                    for (const item of day.items) {
                        totalExp++;
                        const itemType = this.categorizeExp(((_a = item.location_ref) === null || _a === void 0 ? void 0 : _a.name) || '', item.type || '');
                        expTypes.add(itemType);
                        const density = this.calcDensityFromItem(item);
                        densityCurve.push({ time_slot: day.date + ' ' + (item.start_window || '09:00'), density, experience_type: itemType });
                        if (this.isHighlightItem(item)) {
                            peakExperiences.push({ time: day.date + ' ' + (item.start_window || '09:00'), location: ((_b = item.location_ref) === null || _b === void 0 ? void 0 : _b.name) || 'Unknown', experience: item.notes || ((_c = item.location_ref) === null || _c === void 0 ? void 0 : _c.name) || 'Experience', intensity: this.calcIntensityFromItem(item) });
                        }
                        dayDensity += density;
                    }
                }
                if (dayDensity < 30)
                    lowPoints.push({ time: day.date, reason: 'Low activity density', suggestion: 'Add a highlight experience' });
            }
        }
        const variety = Math.min(1, expTypes.size / 4);
        const depth = totalExp > 0 ? Math.min(1, peakExperiences.length / Math.ceil(totalExp * 0.3)) : 0;
        evidence.push({ evidence_id: 'exp_density_' + Date.now(), source: 'ExperienceAgent.analyzeExperienceDensity', timestamp: new Date().toISOString(), data: { total: totalExp } });
        return { density_curve: densityCurve, peak_experiences: peakExperiences, low_points: lowPoints, quality_score: { overall: Math.round((variety * 0.3 + depth * 0.4 + 0.7 * 0.3) * 100) / 100, variety: Math.round(variety * 100) / 100, depth: Math.round(depth * 100) / 100, uniqueness: 0.7 }, evidence, data_quality: this.createDataQuality({ sourceType: 'ESTIMATED', confidence: 0.75, coverage: 1.0 }) };
    }
    async predictFatigue(itinerary, userProfile) {
        var _a, _b;
        const evidence = [];
        const dailyFatigue = [];
        const fitMult = userProfile.fitness_level === 'HIGH' ? 0.7 : userProfile.fitness_level === 'MEDIUM' ? 1.0 : 1.4;
        let cumFatigue = 0;
        const levels = [];
        if (itinerary.days) {
            for (let i = 0; i < itinerary.days.length; i++) {
                const day = itinerary.days[i];
                const curve = [];
                const recovery = [];
                let dayF = cumFatigue * 0.3;
                let peak = { time: '09:00', level: dayF, cause: 'Start' };
                const driveDistanceKm = this.calculateDayDriveDistance(day);
                if (driveDistanceKm > 0)
                    dayF += (driveDistanceKm / 50) * fitMult;
                if (day.items) {
                    for (const item of day.items) {
                        dayF += this.calcItemFatigue(item, fitMult);
                        curve.push({ time: item.start_window || '12:00', fatigue_level: Math.round(dayF) });
                        if (dayF > peak.level)
                            peak = { time: item.end_window || item.start_window || '15:00', level: Math.round(dayF), cause: ((_a = item.location_ref) === null || _a === void 0 ? void 0 : _a.name) || 'Activity' };
                    }
                }
                curve.push({ time: '21:00', fatigue_level: Math.round(Math.max(0, dayF - 30)) });
                recovery.push({ time: '21:00', recovery: 30 });
                dailyFatigue.push({ day: i + 1, date: day.date, fatigue_curve: curve, peak_fatigue: peak, recovery_points: recovery });
                cumFatigue = Math.max(0, dayF - 30);
                levels.push(peak.level);
            }
        }
        const trend = levels.length >= 2 ? (levels[levels.length - 1] > levels[0] * 1.2 ? 'INCREASING' : levels[levels.length - 1] < levels[0] * 0.8 ? 'DECREASING' : 'STABLE') : 'STABLE';
        const endLevel = Math.round(cumFatigue);
        evidence.push({ evidence_id: 'fatigue_' + Date.now(), source: 'ExperienceAgent.predictFatigue', timestamp: new Date().toISOString(), data: { days: ((_b = itinerary.days) === null || _b === void 0 ? void 0 : _b.length) || 0 } });
        return { daily_fatigue: dailyFatigue, cumulative_fatigue: { trend, end_of_trip_level: endLevel, sustainable: endLevel < 70, warning: endLevel >= 70 ? 'Trip may be too intense' : undefined }, overexertion_probability: Math.round(Math.min(1, Math.max(0, (endLevel - 50) / 50)) * 100) / 100, evidence, data_quality: this.createDataQuality({ sourceType: 'ESTIMATED', confidence: 0.7, coverage: 1.0 }) };
    }
    async optimizePace(itinerary, preferences) {
        var _a, _b;
        const evidence = [];
        const opts = [];
        let itemCount = 0, days = ((_a = itinerary.days) === null || _a === void 0 ? void 0 : _a.length) || 1, driveKm = 0;
        if (itinerary.days)
            for (const d of itinerary.days) {
                itemCount += ((_b = d.items) === null || _b === void 0 ? void 0 : _b.length) || 0;
                driveKm += this.calculateDayDriveDistance(d);
            }
        const avgItems = itemCount / days, avgDrive = driveKm / days;
        let pace = avgItems > 6 || avgDrive > 300 ? 'TOO_FAST' : avgItems > 4 || avgDrive > 200 ? 'BRISK' : avgItems >= 2 && avgDrive >= 50 ? 'BALANCED' : avgItems >= 1 ? 'RELAXED' : 'TOO_SLOW';
        if (pace === 'TOO_FAST' && preferences.pace_priority !== 'FAST')
            opts.push({ type: 'ADD_REST', target: 'Day 2-3', reason: 'High density', impact: { pace_improvement: 'BRISK to BALANCED', experience_impact: 'More time per spot', tradeoff: 'Skip 1-2 items' } });
        evidence.push({ evidence_id: 'pace_' + Date.now(), source: 'ExperienceAgent.optimizePace', timestamp: new Date().toISOString(), data: { itemCount, days, pace } });
        return { current_pace: pace, optimizations: opts, optimal_pace_template: { morning: preferences.pace_priority === 'FAST' ? 'FAST' : 'MODERATE', afternoon: preferences.pace_priority === 'SLOW' ? 'SLOW' : 'MODERATE', evening: 'SLOW', rest_periods: ['12:00-13:00 Lunch', '15:00-15:30 Break'] }, evidence, data_quality: this.createDataQuality({ sourceType: 'ESTIMATED', confidence: 0.7, coverage: 1.0 }) };
    }
    async assessHumanExecutability(itinerary, userProfile) {
        var _a, _b;
        const evidence = [];
        const challenges = [];
        const tips = [{ tip: 'Stay hydrated', timing: 'All day', reason: 'Prevent fatigue' }];
        let phys = 0, ment = 0, stress = 0;
        const fitF = userProfile.fitness_level === 'HIGH' ? 0.7 : userProfile.fitness_level === 'MEDIUM' ? 1.0 : 1.5;
        if (itinerary.days) {
            for (const d of itinerary.days) {
                const km = this.calculateDayDriveDistance(d), itemCount = ((_a = d.items) === null || _a === void 0 ? void 0 : _a.length) || 0;
                phys += (km / 100) * fitF * 10 + itemCount * 5 * fitF;
                ment += (km / 50) * 5 + itemCount * 3;
                if (km > 300) {
                    stress += 20;
                    challenges.push({ time: d.date, challenge: 'Long drive: ' + km + 'km', severity: km > 400 ? 'DIFFICULT' : 'CHALLENGING', adaptation: 'Rest stops' });
                }
            }
        }
        const days = ((_b = itinerary.days) === null || _b === void 0 ? void 0 : _b.length) || 1;
        phys = Math.min(100, phys / days);
        ment = Math.min(100, ment / days);
        stress = Math.min(100, stress);
        const recov = Math.max(0, 100 - stress);
        const score = Math.round(100 - phys * 0.3 - ment * 0.2 - stress * 0.3 + recov * 0.2);
        evidence.push({ evidence_id: 'exec_' + Date.now(), source: 'ExperienceAgent.assessHumanExecutability', timestamp: new Date().toISOString(), data: { days, score } });
        return { executability_score: Math.max(0, Math.min(100, score)), breakdown: { physical_demand: Math.round(phys), mental_demand: Math.round(ment), time_stress: Math.round(stress), recovery_adequacy: Math.round(recov) }, challenge_points: challenges, human_tips: tips, evidence, data_quality: this.createDataQuality({ sourceType: 'ESTIMATED', confidence: 0.65, coverage: 1.0 }) };
    }
    categorizeExp(name, itemType) {
        const s = (name + ' ' + itemType).toLowerCase();
        if (s.includes('hike') || s.includes('trek') || s.includes('walk'))
            return 'ADVENTURE';
        if (s.includes('museum') || s.includes('church') || s.includes('cultural'))
            return 'CULTURAL';
        if (s.includes('spa') || s.includes('hot spring') || s.includes('rest'))
            return 'RELAXATION';
        return 'SCENIC';
    }
    calcDensityFromItem(item) {
        var _a;
        const durationMin = ((_a = item.metadata) === null || _a === void 0 ? void 0 : _a.duration_minutes) || 30;
        return Math.min(100, durationMin / 2);
    }
    isHighlightItem(item) {
        var _a;
        const durationMin = ((_a = item.metadata) === null || _a === void 0 ? void 0 : _a.duration_minutes) || 0;
        return durationMin > 90 || item.type === 'POI';
    }
    calcIntensityFromItem(item) {
        var _a;
        const durationMin = ((_a = item.metadata) === null || _a === void 0 ? void 0 : _a.duration_minutes) || 30;
        return Math.min(100, 30 + durationMin / 3);
    }
    calcItemFatigue(item, mult) {
        var _a;
        const durationMin = ((_a = item.metadata) === null || _a === void 0 ? void 0 : _a.duration_minutes) || 30;
        let f = (durationMin / 30) * 5;
        if (item.type === 'WALK')
            f *= 1.5;
        if (item.type === 'TRANSIT')
            f *= 1.2;
        return f * mult;
    }
    calculateDayDriveDistance(day) {
        var _a;
        let distance = 0;
        if (day.items) {
            for (const item of day.items) {
                if (item.type === 'DRIVE' || item.type === 'TRANSIT') {
                    distance += (((_a = item.metadata) === null || _a === void 0 ? void 0 : _a.distance_meters) || 0) / 1000;
                }
            }
        }
        return distance;
    }
    createDataQuality(options) {
        const now = new Date().toISOString();
        return {
            source_type: options.sourceType,
            freshness_seconds: 0,
            confidence: options.confidence,
            coverage: options.coverage,
            retrieved_at: now,
            expires_at: new Date(Date.now() + 7200000).toISOString(),
            fallback_info: options.fallbackInfo,
        };
    }
};
exports.ExperienceAgentService = ExperienceAgentService;
exports.ExperienceAgentService = ExperienceAgentService = ExperienceAgentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], ExperienceAgentService);
//# sourceMappingURL=experience-agent.service.js.map