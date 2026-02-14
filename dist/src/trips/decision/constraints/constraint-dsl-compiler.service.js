"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ConstraintDSLCompiler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConstraintDSLCompiler = void 0;
const common_1 = require("@nestjs/common");
let ConstraintDSLCompiler = ConstraintDSLCompiler_1 = class ConstraintDSLCompiler {
    constructor() {
        this.logger = new common_1.Logger(ConstraintDSLCompiler_1.name);
    }
    compile(dsl, state) {
        if (this.isLegacyFormat(dsl)) {
            this.logger.debug('检测到旧格式约束，自动转换');
            return this.compileLegacyFormat(dsl, state);
        }
        return this.compileNewFormat(dsl, state);
    }
    isLegacyFormat(constraints) {
        return (!constraints.hard_constraints &&
            !constraints.soft_constraints &&
            (constraints.maxElevationM !== undefined ||
                constraints.maxDailyAscentM !== undefined ||
                constraints.maxSlope !== undefined));
    }
    compileNewFormat(dsl, state) {
        const hardConstraints = {};
        const softConstraints = {};
        const objectives = {};
        const pace = state.context.preferences.pace || 'moderate';
        const paceMultiplier = this.getPaceMultiplier(pace);
        if (dsl.hard_constraints) {
            this.compileHardConstraints(dsl.hard_constraints, hardConstraints);
        }
        if (dsl.soft_constraints) {
            this.compileSoftConstraints(dsl.soft_constraints, softConstraints, paceMultiplier);
        }
        this.extractObjectives(dsl.soft_constraints, objectives);
        return {
            hardConstraints,
            softConstraints,
            objectives,
        };
    }
    compileHardConstraints(hard, output) {
        if (hard.date_window) {
            output.date_window = hard.date_window;
        }
        if (hard.budget) {
            output.budget = {
                max: hard.budget.max,
                currency: hard.budget.currency,
                flexible: hard.budget.flexible,
            };
        }
        if (hard.physical_limitations) {
            const pl = hard.physical_limitations;
            if (pl.max_daily_ascent_m !== undefined) {
                output.maxDailyRapidAscentM = pl.max_daily_ascent_m;
            }
            if (pl.max_elevation_m !== undefined) {
                output.maxElevationM = pl.max_elevation_m;
            }
            if (pl.max_slope_pct !== undefined) {
                output.maxSlopePct = pl.max_slope_pct;
            }
            if (pl.rapid_ascent_forbidden !== undefined) {
                output.rapidAscentForbidden = pl.rapid_ascent_forbidden;
            }
            if (pl.daily_activity_hours_max !== undefined) {
                output.dailyActivityHoursMax = pl.daily_activity_hours_max;
            }
            if (pl.wheelchair_accessible !== undefined) {
                output.wheelchairAccessible = pl.wheelchair_accessible;
            }
            if (pl.no_stairs !== undefined) {
                output.noStairs = pl.no_stairs;
            }
            if (pl.no_long_hiking !== undefined) {
                output.noLongHiking = pl.no_long_hiking;
            }
        }
        if (hard.travel_mode) {
            const tm = hard.travel_mode;
            if (tm.allow_self_drive !== undefined) {
                output.allowSelfDrive = tm.allow_self_drive;
            }
            if (tm.max_transfers !== undefined) {
                output.maxTransfers = tm.max_transfers;
            }
            if (tm.no_early_morning !== undefined) {
                output.noEarlyMorning = tm.no_early_morning;
            }
            if (tm.no_late_night !== undefined) {
                output.noLateNight = tm.no_late_night;
            }
        }
        if (hard.requirements) {
            const req = hard.requirements;
            if (req.requires_permit !== undefined) {
                output.requiresPermit = req.requires_permit;
            }
            if (req.requires_guide !== undefined) {
                output.requiresGuide = req.requires_guide;
            }
        }
    }
    compileSoftConstraints(soft, output, paceMultiplier) {
        if (soft.pace) {
            output.pacePreference = soft.pace.preference;
            output.paceWeight = soft.pace.weight;
        }
        if (soft.scenery) {
            output.sceneryPreference = soft.scenery.nature_vs_city;
            output.sceneryWeight = soft.scenery.weight;
        }
        if (soft.photography) {
            output.photographyImportance = soft.photography.importance;
        }
        if (soft.comfort_level) {
            output.hotelQuality = soft.comfort_level.hotel_quality;
            output.comfortWeight = soft.comfort_level.weight;
        }
        if (soft.activity_intensity) {
            output.activityIntensityPreference = soft.activity_intensity.preference;
            output.activityIntensityWeight = soft.activity_intensity.weight;
        }
        if (soft.risk_tolerance) {
            output.riskTolerance = soft.risk_tolerance.level;
            output.riskToleranceWeight = soft.risk_tolerance.weight;
        }
        if (soft.cost_sensitivity) {
            output.costSensitivity = soft.cost_sensitivity.level;
            output.costSensitivityWeight = soft.cost_sensitivity.weight;
        }
    }
    extractObjectives(soft, output) {
        if (!soft)
            return;
        if (soft.photography && soft.photography.importance > 0.5) {
            output.preferPhotography = true;
        }
        if (soft.scenery && soft.scenery.nature_vs_city === 'nature') {
            output.preferViewpoints = true;
        }
        if (soft.comfort_level && soft.comfort_level.hotel_quality === 'high') {
            output.preferHotSpring = true;
        }
    }
    compileLegacyFormat(constraints, state) {
        const hardConstraints = {};
        const softConstraints = {};
        const objectives = {};
        const pace = state.context.preferences.pace || 'moderate';
        const paceMultiplier = this.getPaceMultiplier(pace);
        if (constraints.maxSlope !== undefined) {
            hardConstraints.maxSlopePct = constraints.maxSlope;
        }
        if (constraints.rapidAscentForbidden !== undefined) {
            hardConstraints.rapidAscentForbidden = constraints.rapidAscentForbidden;
        }
        if (constraints.maxElevationM !== undefined) {
            softConstraints.maxElevationM = Math.round(constraints.maxElevationM * paceMultiplier.elevation);
        }
        if (constraints.maxDailyAscentM !== undefined) {
            softConstraints.maxDailyAscentM = Math.round(constraints.maxDailyAscentM * paceMultiplier.ascent);
        }
        if (constraints.bufferTimeMin !== undefined) {
            softConstraints.bufferTimeMin = Math.round(constraints.bufferTimeMin * paceMultiplier.buffer);
        }
        if (constraints.preferViewpoints !== undefined) {
            objectives.preferViewpoints = constraints.preferViewpoints;
        }
        if (constraints.preferHotSpring !== undefined) {
            objectives.preferHotSpring = constraints.preferHotSpring;
        }
        if (constraints.preferPhotography !== undefined) {
            objectives.preferPhotography = constraints.preferPhotography;
        }
        return {
            hardConstraints,
            softConstraints,
            objectives,
        };
    }
    getPaceMultiplier(pace) {
        switch (pace) {
            case 'relaxed':
                return {
                    ascent: 0.7,
                    elevation: 0.8,
                    buffer: 1.5,
                };
            case 'intense':
                return {
                    ascent: 1.2,
                    elevation: 1.1,
                    buffer: 0.7,
                };
            case 'moderate':
            default:
                return {
                    ascent: 1.0,
                    elevation: 1.0,
                    buffer: 1.0,
                };
        }
    }
};
exports.ConstraintDSLCompiler = ConstraintDSLCompiler;
exports.ConstraintDSLCompiler = ConstraintDSLCompiler = ConstraintDSLCompiler_1 = __decorate([
    (0, common_1.Injectable)()
], ConstraintDSLCompiler);
//# sourceMappingURL=constraint-dsl-compiler.service.js.map