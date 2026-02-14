"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var EvidenceFilteringService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvidenceFilteringService = void 0;
const common_1 = require("@nestjs/common");
const evidence_dto_1 = require("../dto/evidence.dto");
let EvidenceFilteringService = EvidenceFilteringService_1 = class EvidenceFilteringService {
    constructor() {
        this.logger = new common_1.Logger(EvidenceFilteringService_1.name);
    }
    filterAndSort(items, priority = evidence_dto_1.EvidencePriorityFilter.ALL, groupBy = evidence_dto_1.EvidenceGroupBy.NONE, sortBy = evidence_dto_1.EvidenceSortBy.TIME, currentDay) {
        let filtered = this.filterByPriority(items, priority);
        filtered = this.sortItems(filtered, sortBy, currentDay);
        if (groupBy !== evidence_dto_1.EvidenceGroupBy.NONE) {
        }
        return filtered;
    }
    filterByPriority(items, priority) {
        if (priority === evidence_dto_1.EvidencePriorityFilter.ALL) {
            return items;
        }
        return items.filter(item => {
            const importance = this.calculateImportance(item);
            if (priority === evidence_dto_1.EvidencePriorityFilter.HIGH) {
                return importance >= 0.7;
            }
            else if (priority === evidence_dto_1.EvidencePriorityFilter.MEDIUM_AND_HIGH) {
                return importance >= 0.4;
            }
            return true;
        });
    }
    calculateImportance(item) {
        let importance = 0.5;
        if (item.severity === evidence_dto_1.EvidenceSeverity.HIGH) {
            importance += 0.4;
        }
        else if (item.severity === evidence_dto_1.EvidenceSeverity.MEDIUM) {
            importance += 0.2;
        }
        if (item.freshness) {
            if (item.freshness.freshnessStatus === evidence_dto_1.EvidenceFreshnessStatus.EXPIRED) {
                importance += 0.2;
            }
            else if (item.freshness.freshnessStatus === evidence_dto_1.EvidenceFreshnessStatus.STALE) {
                importance += 0.1;
            }
        }
        if (item.qualityScore) {
            if (item.qualityScore.level === 'HIGH') {
                importance += 0.2;
            }
            else if (item.qualityScore.level === 'MEDIUM') {
                importance += 0.1;
            }
        }
        if (item.confidence) {
            if (item.confidence.level === 'HIGH') {
                importance += 0.2;
            }
            else if (item.confidence.level === 'MEDIUM') {
                importance += 0.1;
            }
        }
        return Math.min(1, Math.max(0, importance));
    }
    sortItems(items, sortBy, currentDay) {
        const sorted = [...items];
        switch (sortBy) {
            case evidence_dto_1.EvidenceSortBy.IMPORTANCE:
                sorted.sort((a, b) => {
                    const importanceA = this.calculateImportance(a);
                    const importanceB = this.calculateImportance(b);
                    return importanceB - importanceA;
                });
                break;
            case evidence_dto_1.EvidenceSortBy.RELEVANCE:
                sorted.sort((a, b) => {
                    if (currentDay !== undefined) {
                        if (a.day === currentDay && b.day !== currentDay)
                            return -1;
                        if (a.day !== currentDay && b.day === currentDay)
                            return 1;
                    }
                    const importanceA = this.calculateImportance(a);
                    const importanceB = this.calculateImportance(b);
                    return importanceB - importanceA;
                });
                break;
            case evidence_dto_1.EvidenceSortBy.FRESHNESS:
                sorted.sort((a, b) => {
                    const freshnessA = this.getFreshnessScore(a);
                    const freshnessB = this.getFreshnessScore(b);
                    return freshnessB - freshnessA;
                });
                break;
            case evidence_dto_1.EvidenceSortBy.QUALITY:
                sorted.sort((a, b) => {
                    var _a, _b;
                    const qualityA = ((_a = a.qualityScore) === null || _a === void 0 ? void 0 : _a.overallScore) || 0;
                    const qualityB = ((_b = b.qualityScore) === null || _b === void 0 ? void 0 : _b.overallScore) || 0;
                    return qualityB - qualityA;
                });
                break;
            case evidence_dto_1.EvidenceSortBy.TIME:
            default:
                sorted.sort((a, b) => {
                    const timeA = new Date(a.timestamp).getTime();
                    const timeB = new Date(b.timestamp).getTime();
                    return timeB - timeA;
                });
                break;
        }
        return sorted;
    }
    getFreshnessScore(item) {
        if (!item.freshness) {
            return 0.5;
        }
        switch (item.freshness.freshnessStatus) {
            case evidence_dto_1.EvidenceFreshnessStatus.FRESH:
                return 1.0;
            case evidence_dto_1.EvidenceFreshnessStatus.STALE:
                return 0.5;
            case evidence_dto_1.EvidenceFreshnessStatus.EXPIRED:
                return 0.0;
            default:
                return 0.5;
        }
    }
    groupItems(items, groupBy) {
        const grouped = {};
        if (groupBy === evidence_dto_1.EvidenceGroupBy.NONE) {
            return { 'all': items };
        }
        for (const item of items) {
            let key;
            switch (groupBy) {
                case evidence_dto_1.EvidenceGroupBy.IMPORTANCE:
                    const importance = this.calculateImportance(item);
                    if (importance >= 0.7) {
                        key = 'high';
                    }
                    else if (importance >= 0.4) {
                        key = 'medium';
                    }
                    else {
                        key = 'low';
                    }
                    break;
                case evidence_dto_1.EvidenceGroupBy.TYPE:
                    key = item.type;
                    break;
                case evidence_dto_1.EvidenceGroupBy.DAY:
                    key = item.day ? `day-${item.day}` : 'unknown';
                    break;
                default:
                    key = 'all';
            }
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(item);
        }
        return grouped;
    }
};
exports.EvidenceFilteringService = EvidenceFilteringService;
exports.EvidenceFilteringService = EvidenceFilteringService = EvidenceFilteringService_1 = __decorate([
    (0, common_1.Injectable)()
], EvidenceFilteringService);
//# sourceMappingURL=evidence-filtering.service.js.map