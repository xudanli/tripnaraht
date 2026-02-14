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
var EvidenceTriggerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvidenceTriggerService = void 0;
const common_1 = require("@nestjs/common");
const evidence_dto_1 = require("../dto/evidence.dto");
const evidence_completeness_checker_service_1 = require("./evidence-completeness-checker.service");
const prisma_service_1 = require("../../prisma/prisma.service");
let EvidenceTriggerService = EvidenceTriggerService_1 = class EvidenceTriggerService {
    constructor(completenessChecker, prisma) {
        this.completenessChecker = completenessChecker;
        this.prisma = prisma;
        this.logger = new common_1.Logger(EvidenceTriggerService_1.name);
    }
    async checkAndSuggest(tripId) {
        var _a;
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    include: {
                        ItineraryItem: {
                            include: {
                                Place: true,
                            },
                        },
                    },
                },
            },
        });
        if (!trip) {
            throw new Error(`行程 ID ${tripId} 不存在`);
        }
        const places = [];
        for (const tripDay of trip.TripDay) {
            for (const item of tripDay.ItineraryItem) {
                if (item.Place) {
                    places.push(item.Place);
                }
            }
        }
        const evidenceResult = await this.getExistingEvidence(tripId);
        const existingEvidence = evidenceResult.items.map(item => ({
            poiId: item.poiId,
            type: item.type,
        }));
        const completenessResult = this.completenessChecker.checkCompleteness(places, existingEvidence, (_a = trip.startDate) === null || _a === void 0 ? void 0 : _a.toISOString());
        const suggestions = this.generateSuggestions(completenessResult);
        const bulkFetchSuggestion = this.generateBulkFetchSuggestion(suggestions);
        return {
            hasMissingEvidence: completenessResult.missingEvidence.length > 0,
            completenessScore: completenessResult.completenessScore,
            suggestions,
            bulkFetchSuggestion,
        };
    }
    async getExistingEvidence(tripId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    include: {
                        ItineraryItem: {
                            include: {
                                Place: true,
                            },
                        },
                    },
                },
            },
        });
        if (!trip) {
            return { items: [] };
        }
        const items = [];
        for (const tripDay of trip.TripDay) {
            for (const item of tripDay.ItineraryItem) {
                if (item.Place) {
                    const metadata = item.Place.metadata || {};
                    if (metadata.openingHours || metadata.opening_hours) {
                        items.push({ poiId: item.Place.id.toString(), type: evidence_dto_1.EvidenceType.OPENING_HOURS });
                    }
                    if (metadata.weatherInfo || metadata.weather) {
                        items.push({ poiId: item.Place.id.toString(), type: evidence_dto_1.EvidenceType.WEATHER });
                    }
                    if (metadata.roadStatus || metadata.roadClosure) {
                        items.push({ poiId: item.Place.id.toString(), type: evidence_dto_1.EvidenceType.ROAD_CLOSURE });
                    }
                    if (metadata.bookingConfirmation || metadata.reservation) {
                        items.push({ poiId: item.Place.id.toString(), type: evidence_dto_1.EvidenceType.BOOKING });
                    }
                }
            }
        }
        return { items };
    }
    generateSuggestions(completenessResult) {
        const suggestions = [];
        for (const recommendation of completenessResult.recommendations) {
            const affectedPois = completenessResult.missingEvidence.filter(m => recommendation.affectedPois.includes(m.poiId));
            const poiNames = affectedPois.map(p => p.poiName).join('、');
            const reason = affectedPois.map(p => p.reason).join('；');
            suggestions.push({
                id: `suggestion-${recommendation.evidenceTypes.join('-')}-${Date.now()}`,
                description: recommendation.action,
                priority: recommendation.priority,
                evidenceTypes: recommendation.evidenceTypes,
                affectedPoiIds: recommendation.affectedPois,
                estimatedTime: recommendation.estimatedTime,
                reason,
                canBatchFetch: true,
            });
        }
        return suggestions;
    }
    generateBulkFetchSuggestion(suggestions) {
        const highPrioritySuggestions = suggestions.filter(s => s.priority === 'HIGH');
        if (highPrioritySuggestions.length === 0) {
            return undefined;
        }
        const allEvidenceTypes = new Set();
        const allPoiIds = new Set();
        let totalTime = 0;
        for (const suggestion of highPrioritySuggestions) {
            suggestion.evidenceTypes.forEach(type => allEvidenceTypes.add(type));
            suggestion.affectedPoiIds.forEach(id => allPoiIds.add(id));
            totalTime += suggestion.estimatedTime;
        }
        return {
            evidenceTypes: Array.from(allEvidenceTypes),
            affectedPoiIds: Array.from(allPoiIds),
            estimatedTime: totalTime,
            description: `一键获取 ${highPrioritySuggestions.length} 项高优先级证据（${allPoiIds.size} 个POI）`,
        };
    }
    async shouldAutoTrigger(tripId, threshold = 0.7) {
        const result = await this.checkAndSuggest(tripId);
        if (result.completenessScore < threshold) {
            return true;
        }
        const hasHighPriorityMissing = result.suggestions.some(s => s.priority === 'HIGH');
        return hasHighPriorityMissing;
    }
};
exports.EvidenceTriggerService = EvidenceTriggerService;
exports.EvidenceTriggerService = EvidenceTriggerService = EvidenceTriggerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [evidence_completeness_checker_service_1.EvidenceCompletenessChecker,
        prisma_service_1.PrismaService])
], EvidenceTriggerService);
//# sourceMappingURL=evidence-trigger.service.js.map