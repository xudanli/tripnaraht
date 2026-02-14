"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanConverterService = void 0;
const common_1 = require("@nestjs/common");
let PlanConverterService = class PlanConverterService {
    convertTripPlanToRoutePlanDraft(plan, tripId, routeDirectionId) {
        const segments = [];
        for (const day of plan.days) {
            const terrainFacts = day.terrainFacts;
            const totalAscentM = (terrainFacts === null || terrainFacts === void 0 ? void 0 : terrainFacts.totalAscent) || 0;
            const maxElevation = (terrainFacts === null || terrainFacts === void 0 ? void 0 : terrainFacts.maxElevation) || 0;
            const minElevation = (terrainFacts === null || terrainFacts === void 0 ? void 0 : terrainFacts.minElevation) || 0;
            const estimatedDistanceKm = day.timeSlots.length * 10;
            const estimatedSlopePct = estimatedDistanceKm > 0
                ? (totalAscentM / (estimatedDistanceKm * 1000)) * 100
                : 0;
            const firstSlot = day.timeSlots[0];
            const lastSlot = day.timeSlots[day.timeSlots.length - 1];
            segments.push({
                segmentId: `day_${day.day}_segment_1`,
                dayIndex: day.day,
                distanceKm: estimatedDistanceKm,
                ascentM: totalAscentM,
                slopePct: Math.min(estimatedSlopePct, 50),
                metadata: {
                    fromPoiId: firstSlot === null || firstSlot === void 0 ? void 0 : firstSlot.poiId,
                    toPoiId: lastSlot === null || lastSlot === void 0 ? void 0 : lastSlot.poiId,
                    maxElevation,
                    minElevation,
                    date: day.date,
                },
            });
        }
        return {
            tripId,
            routeDirectionId,
            segments,
        };
    }
    applyRoutePlanDraftToTripPlan(draft, originalPlan, world) {
        var _a, _b;
        const updatedDays = [...originalPlan.days];
        const segmentsByDay = new Map();
        for (const segment of draft.segments) {
            const dayIndex = segment.dayIndex;
            if (!segmentsByDay.has(dayIndex)) {
                segmentsByDay.set(dayIndex, []);
            }
            segmentsByDay.get(dayIndex).push(segment);
        }
        for (const [dayIndex, segments] of segmentsByDay.entries()) {
            const day = updatedDays[dayIndex - 1];
            if (!day)
                continue;
            const totalAscentM = segments.reduce((sum, seg) => sum + seg.ascentM, 0);
            const maxElevation = Math.max(...segments.map(seg => { var _a; return ((_a = seg.metadata) === null || _a === void 0 ? void 0 : _a.maxElevation) || 0; }));
            const minElevation = Math.min(...segments.map(seg => { var _a; return ((_a = seg.metadata) === null || _a === void 0 ? void 0 : _a.minElevation) || maxElevation; }));
            day.terrainFacts = {
                ...day.terrainFacts,
                totalAscent: totalAscentM,
                maxElevation: maxElevation || ((_a = day.terrainFacts) === null || _a === void 0 ? void 0 : _a.maxElevation),
                minElevation: minElevation !== maxElevation ? minElevation : (_b = day.terrainFacts) === null || _b === void 0 ? void 0 : _b.minElevation,
            };
        }
        return {
            ...originalPlan,
            days: updatedDays,
        };
    }
};
exports.PlanConverterService = PlanConverterService;
exports.PlanConverterService = PlanConverterService = __decorate([
    (0, common_1.Injectable)()
], PlanConverterService);
//# sourceMappingURL=plan-converter.service.js.map