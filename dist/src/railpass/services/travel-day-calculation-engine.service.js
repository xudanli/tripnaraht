"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var TravelDayCalculationEngineService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TravelDayCalculationEngineService = void 0;
const common_1 = require("@nestjs/common");
let TravelDayCalculationEngineService = TravelDayCalculationEngineService_1 = class TravelDayCalculationEngineService {
    constructor() {
        this.logger = new common_1.Logger(TravelDayCalculationEngineService_1.name);
    }
    calculateTravelDays(input) {
        const { segments, passProfile } = input;
        if (passProfile.validityType === 'CONTINUOUS') {
            return {
                totalDaysUsed: 0,
                daysByDate: {},
                remainingDays: undefined,
            };
        }
        const daysByDate = {};
        const segmentsByDate = new Map();
        for (const seg of segments) {
            const date = seg.departureDate;
            if (!segmentsByDate.has(date)) {
                segmentsByDate.set(date, []);
            }
            segmentsByDate.get(date).push(seg);
        }
        let totalDaysUsed = 0;
        for (const [date, segs] of segmentsByDate.entries()) {
            let consumed = false;
            let crossesMidnight = false;
            const segmentIds = [];
            for (const seg of segs) {
                segmentIds.push(seg.segmentId);
                if (seg.isNightTrain) {
                    if (seg.crossesMidnight) {
                        crossesMidnight = true;
                        consumed = true;
                    }
                    else {
                        consumed = true;
                    }
                }
                else {
                    consumed = true;
                }
            }
            if (consumed) {
                totalDaysUsed++;
                daysByDate[date] = {
                    consumed: true,
                    segments: segmentIds,
                    crossesMidnight,
                    explanation: this.generateDayExplanation(segs, crossesMidnight),
                };
                if (crossesMidnight) {
                    const arrivalDate = this.addDays(date, 1);
                    if (!daysByDate[arrivalDate]) {
                        totalDaysUsed++;
                        daysByDate[arrivalDate] = {
                            consumed: true,
                            segments: segmentIds,
                            crossesMidnight: true,
                            explanation: `跨午夜夜车到达日，与出发日 ${date} 共享 Travel Day`,
                        };
                    }
                }
            }
        }
        const remainingDays = passProfile.travelDaysTotal
            ? Math.max(0, passProfile.travelDaysTotal - totalDaysUsed)
            : undefined;
        const violations = [];
        if (passProfile.travelDaysTotal && totalDaysUsed > passProfile.travelDaysTotal) {
            violations.push({
                date: Object.keys(daysByDate).sort()[0],
                message: `Travel Days 超限：已用 ${totalDaysUsed} 天，Pass 仅 ${passProfile.travelDaysTotal} 天`,
            });
        }
        return {
            totalDaysUsed,
            daysByDate,
            remainingDays,
            violations,
        };
    }
    generateDayExplanation(segments, crossesMidnight) {
        const parts = [];
        if (segments.length === 1) {
            const seg = segments[0];
            if (seg.isNightTrain) {
                if (crossesMidnight) {
                    parts.push('夜车跨午夜，消耗 2 个 Travel Day');
                }
                else {
                    parts.push('直达夜车，消耗 1 个 Travel Day');
                }
            }
            else {
                parts.push('当日列车，消耗 1 个 Travel Day');
            }
        }
        else {
            parts.push(`${segments.length} 段行程`);
            if (crossesMidnight) {
                parts.push('含跨午夜换乘，消耗 2 个 Travel Day');
            }
            else {
                parts.push('消耗 1 个 Travel Day');
            }
        }
        return parts.join('，');
    }
    addDays(dateStr, days) {
        const date = new Date(dateStr);
        date.setDate(date.getDate() + days);
        return date.toISOString().split('T')[0];
    }
    simulateTravelDays(args) {
        return this.calculateTravelDays(args);
    }
};
exports.TravelDayCalculationEngineService = TravelDayCalculationEngineService;
exports.TravelDayCalculationEngineService = TravelDayCalculationEngineService = TravelDayCalculationEngineService_1 = __decorate([
    (0, common_1.Injectable)()
], TravelDayCalculationEngineService);
//# sourceMappingURL=travel-day-calculation-engine.service.js.map