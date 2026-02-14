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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ItineraryGenerateSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ItineraryGenerateSkill = void 0;
const common_1 = require("@nestjs/common");
const skill_decorator_1 = require("../decorators/skill.decorator");
const planning_workbench_agent_service_1 = require("../../agent/services/planning-workbench-agent.service");
const luxon_1 = require("luxon");
let ItineraryGenerateSkill = ItineraryGenerateSkill_1 = class ItineraryGenerateSkill {
    constructor(planningWorkbench) {
        this.planningWorkbench = planningWorkbench;
        this.logger = new common_1.Logger(ItineraryGenerateSkill_1.name);
        this.metadata = {
            name: 'itinerary.generate',
            description: '生成结构化行程草案',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
            inputSchema: {
                required: ['request'],
            },
        };
        this.logger.log(`[ItineraryGenerateSkill] 已初始化`);
    }
    async execute(input) {
        var _a, _b;
        this.logger.debug(`执行 itinerary.generate: request_id=${input.request.request_id}`);
        try {
            const { request, research_data, gate_result } = input;
            let days;
            if (request.days) {
                days = request.days;
            }
            else if (request.date_range) {
                const start = luxon_1.DateTime.fromISO(request.date_range.start_date);
                const end = luxon_1.DateTime.fromISO(request.date_range.end_date);
                days = end.diff(start, 'days').days + 1;
            }
            else if (request.start_date) {
                days = request.days || 5;
            }
            else {
                days = 5;
            }
            let startDate;
            if (request.date_range) {
                startDate = luxon_1.DateTime.fromISO(request.date_range.start_date);
            }
            else if (request.start_date) {
                startDate = luxon_1.DateTime.fromISO(request.start_date);
            }
            else {
                startDate = luxon_1.DateTime.now().plus({ days: 1 });
            }
            const poiEvidence = research_data === null || research_data === void 0 ? void 0 : research_data.poi_evidence;
            const pois = Array.isArray(poiEvidence)
                ? poiEvidence
                : ((poiEvidence === null || poiEvidence === void 0 ? void 0 : poiEvidence.pois) || []);
            const itineraryDays = [];
            const itemsPerDay = Math.ceil(pois.length / days);
            for (let dayIndex = 0; dayIndex < days; dayIndex++) {
                const currentDate = startDate.plus({ days: dayIndex });
                const dayItems = [];
                const startPoiIndex = dayIndex * itemsPerDay;
                const endPoiIndex = Math.min(startPoiIndex + itemsPerDay, pois.length);
                const dayPois = pois.slice(startPoiIndex, endPoiIndex);
                for (let i = 0; i < dayPois.length; i++) {
                    const poi = dayPois[i];
                    const poiId = poi.poi_id || poi.id || `poi_${startPoiIndex + i}`;
                    const poiName = poi.name || poi.nameCN || poi.nameEN || '未知地点';
                    const poiCoords = poi.coordinates || (poi.lat && poi.lng ? { lat: poi.lat, lng: poi.lng } : undefined);
                    const startHour = 9 + i * 2;
                    const startTime = `${startHour.toString().padStart(2, '0')}:00`;
                    const endTime = `${(startHour + 2).toString().padStart(2, '0')}:00`;
                    const item = {
                        id: `${request.request_id}_day${dayIndex + 1}_item${i + 1}`,
                        type: 'POI',
                        start_window: startTime,
                        end_window: endTime,
                        location_ref: {
                            place_id: poiId,
                            name: poiName,
                            coordinates: poiCoords,
                            address: poi.address,
                        },
                        evidence_refs: poi.evidence_id ? [poi.evidence_id] : [],
                        verified: false,
                        verification_status: 'UNVERIFIED',
                        metadata: {
                            duration_minutes: 120,
                        },
                    };
                    dayItems.push(item);
                }
                if (dayItems.length === 0) {
                    dayItems.push({
                        id: `${request.request_id}_day${dayIndex + 1}_placeholder`,
                        type: 'REST',
                        start_window: '09:00',
                        end_window: '18:00',
                        location_ref: {
                            name: '待安排',
                        },
                        evidence_refs: [],
                        verified: false,
                        verification_status: 'ASSUMPTION',
                    });
                }
                itineraryDays.push({
                    date: currentDate.toISODate() || currentDate.toFormat('yyyy-MM-dd'),
                    items: dayItems,
                });
            }
            let totalCostEstimate;
            if ((_b = (_a = request.constraints) === null || _a === void 0 ? void 0 : _a.budget) === null || _b === void 0 ? void 0 : _b.total) {
                totalCostEstimate = request.constraints.budget.total;
            }
            const robustnessScore = this.calculateRobustnessScore(pois, gate_result, research_data);
            return {
                request_id: request.request_id,
                days: itineraryDays,
                metadata: {
                    total_days: days,
                    total_cost_estimate: totalCostEstimate,
                    robustness_score: robustnessScore,
                },
            };
        }
        catch (error) {
            this.logger.error(`itinerary.generate 失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    calculateRobustnessScore(pois, gateResult, researchData) {
        let score = 0.5;
        if (pois && pois.length > 0) {
            score += 0.2;
        }
        if (researchData === null || researchData === void 0 ? void 0 : researchData.transport_evidence) {
            score += 0.1;
        }
        if (researchData === null || researchData === void 0 ? void 0 : researchData.opening_hours_evidence) {
            score += 0.1;
        }
        if (gateResult) {
            if (gateResult.gate_result === 'ALLOW') {
                score += 0.1;
            }
            else if (gateResult.gate_result === 'ADJUST_REQUIRED') {
                score -= 0.1;
            }
            else if (gateResult.gate_result === 'BLOCK') {
                score -= 0.3;
            }
        }
        return Math.max(0, Math.min(1, score));
    }
};
exports.ItineraryGenerateSkill = ItineraryGenerateSkill;
exports.ItineraryGenerateSkill = ItineraryGenerateSkill = ItineraryGenerateSkill_1 = __decorate([
    (0, skill_decorator_1.Skill)({
        name: 'itinerary.generate',
        description: '生成结构化行程草案',
        version: '1.0.0',
        category: 'trip',
        toolGroup: 'DOMAIN',
    }),
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [planning_workbench_agent_service_1.PlanningWorkbenchAgentService])
], ItineraryGenerateSkill);
//# sourceMappingURL=itinerary-generate.skill.js.map