"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeasibilityService = void 0;
const common_1 = require("@nestjs/common");
const time_utils_1 = require("../utils/time-utils");
let FeasibilityService = class FeasibilityService {
    isPoiFeasible(poi, atTimeMin, policy, dayOfWeek, dateISO) {
        var _a;
        const c = policy.constraints;
        if (c.requireWheelchairAccess && poi.wheelchairAccess === false) {
            return {
                feasible: false,
                reason: 'POI_NOT_WHEELCHAIR_ACCESSIBLE',
                inOpenWindow: false,
                pastLastEntry: false,
                isClosedDate: false,
            };
        }
        if (c.forbidStairs && poi.stairsRequired === true) {
            return {
                feasible: false,
                reason: 'POI_STAIRS_REQUIRED',
                inOpenWindow: false,
                pastLastEntry: false,
                isClosedDate: false,
            };
        }
        if (!poi.openingHours) {
            return {
                feasible: true,
                inOpenWindow: true,
                pastLastEntry: false,
                isClosedDate: false,
            };
        }
        const oh = poi.openingHours;
        if (dateISO && ((_a = oh.closedDates) === null || _a === void 0 ? void 0 : _a.includes(dateISO))) {
            return {
                feasible: false,
                reason: 'CLOSED_DATE',
                inOpenWindow: false,
                pastLastEntry: false,
                isClosedDate: true,
            };
        }
        const inOpenWindow = (0, time_utils_1.isOpenAt)(oh, dayOfWeek, atTimeMin, dateISO);
        const lastEntry = (0, time_utils_1.latestEntryMin)(oh, dayOfWeek);
        const pastLastEntry = lastEntry !== undefined && atTimeMin > lastEntry;
        if (!inOpenWindow || pastLastEntry) {
            const waitEstimate = this.estimateWait(poi, atTimeMin, dayOfWeek, dateISO);
            if (pastLastEntry) {
                return {
                    feasible: false,
                    reason: 'PAST_LAST_ENTRY',
                    waitMin: waitEstimate.waitMin,
                    inOpenWindow: inOpenWindow,
                    pastLastEntry: true,
                    isClosedDate: false,
                };
            }
            if (waitEstimate.waitMin > 0 && waitEstimate.waitMin < 180) {
                return {
                    feasible: true,
                    waitMin: waitEstimate.waitMin,
                    inOpenWindow: false,
                    pastLastEntry: false,
                    isClosedDate: false,
                };
            }
            return {
                feasible: false,
                reason: waitEstimate.reason,
                waitMin: waitEstimate.waitMin,
                inOpenWindow: false,
                pastLastEntry: false,
                isClosedDate: false,
            };
        }
        return {
            feasible: true,
            inOpenWindow: true,
            pastLastEntry: false,
            isClosedDate: false,
        };
    }
    isTransitFeasible(segment, policy) {
        var _a;
        const c = policy.constraints;
        if (c.requireWheelchairAccess && segment.wheelchairAccessible === false) {
            return {
                feasible: false,
                reason: 'TRANSIT_NOT_WHEELCHAIR_ACCESSIBLE',
                violatesHardConstraints: true,
            };
        }
        if (c.forbidStairs &&
            ((_a = segment.stairsCount) !== null && _a !== void 0 ? _a : 0) > 0 &&
            segment.elevatorAvailable !== true) {
            return {
                feasible: false,
                reason: 'TRANSIT_HAS_STAIRS_NO_ELEVATOR',
                violatesHardConstraints: true,
            };
        }
        if (segment.walkMin > c.maxSingleWalkMin) {
            return {
                feasible: false,
                reason: 'TRANSIT_WALK_TOO_LONG',
                violatesHardConstraints: true,
            };
        }
        return {
            feasible: true,
            violatesHardConstraints: false,
        };
    }
    estimateWait(poi, atTimeMin, dayOfWeek, dateISO, event) {
        var _a, _b;
        if (!poi.openingHours) {
            return {
                waitMin: 0,
                reason: 'NO_OPENING_HOURS_DATA',
            };
        }
        const oh = poi.openingHours;
        if (dateISO && ((_a = oh.closedDates) === null || _a === void 0 ? void 0 : _a.includes(dateISO))) {
            return {
                waitMin: Infinity,
                reason: 'CLOSED_DATE',
            };
        }
        if ((event === null || event === void 0 ? void 0 : event.type) === 'POI_CLOSED' && event.poiId === poi.id) {
            const eff = (_b = event.effectiveFromMin) !== null && _b !== void 0 ? _b : 0;
            if (atTimeMin >= eff) {
                return {
                    waitMin: Infinity,
                    reason: 'POI_CLOSED_BY_EVENT',
                };
            }
        }
        const isHolidayToday = dateISO ? (0, time_utils_1.isHoliday)(dateISO) : false;
        const applicableWindows = oh.windows.filter((w) => {
            if (w.holidayDates && dateISO) {
                return w.holidayDates.includes(dateISO);
            }
            if (w.holidaysOnly !== undefined) {
                if (w.holidaysOnly !== isHolidayToday) {
                    return false;
                }
            }
            if (w.dayOfWeek !== undefined) {
                return w.dayOfWeek === dayOfWeek;
            }
            return true;
        });
        if (applicableWindows.length === 0) {
            return {
                waitMin: Infinity,
                reason: 'NO_OPEN_WINDOW',
            };
        }
        const inWindow = applicableWindows.find((w) => atTimeMin >= this.hhmmToMin(w.start) &&
            atTimeMin <= this.hhmmToMin(w.end));
        if (inWindow) {
            return {
                waitMin: 0,
                reason: 'ALREADY_OPEN',
            };
        }
        const nextStartTimes = applicableWindows
            .map((w) => this.hhmmToMin(w.start))
            .filter((s) => s > atTimeMin)
            .sort((a, b) => a - b);
        if (nextStartTimes.length === 0) {
            return {
                waitMin: Infinity,
                reason: 'CLOSED_REST_OF_DAY',
            };
        }
        const nextOpenMin = nextStartTimes[0];
        const waitMin = nextOpenMin - atTimeMin;
        return {
            waitMin,
            reason: waitMin < 180 ? 'WAIT_UNTIL_OPEN' : 'WAIT_TOO_LONG',
            nextOpenMin,
        };
    }
    hhmmToMin(hhmm) {
        const [h, m] = hhmm.split(':').map(Number);
        return h * 60 + m;
    }
};
exports.FeasibilityService = FeasibilityService;
exports.FeasibilityService = FeasibilityService = __decorate([
    (0, common_1.Injectable)()
], FeasibilityService);
//# sourceMappingURL=feasibility.service.js.map