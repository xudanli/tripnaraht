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
var EvidenceManagementService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvidenceManagementService = void 0;
const common_1 = require("@nestjs/common");
const evidence_freshness_calculator_service_1 = require("./evidence-freshness-calculator.service");
const evidence_confidence_calculator_service_1 = require("./evidence-confidence-calculator.service");
const evidence_quality_scorer_service_1 = require("./evidence-quality-scorer.service");
let EvidenceManagementService = EvidenceManagementService_1 = class EvidenceManagementService {
    constructor(freshnessCalculator, confidenceCalculator, qualityScorer) {
        this.freshnessCalculator = freshnessCalculator;
        this.confidenceCalculator = confidenceCalculator;
        this.qualityScorer = qualityScorer;
        this.logger = new common_1.Logger(EvidenceManagementService_1.name);
    }
    async enrichEvidenceItem(item, place) {
        const freshness = this.freshnessCalculator.calculateFreshness(item, place);
        const itemWithFreshness = freshness ? { ...item, freshness } : item;
        const confidence = this.confidenceCalculator.calculateConfidence(itemWithFreshness);
        const itemWithConfidence = { ...itemWithFreshness, confidence };
        const qualityScore = await this.qualityScorer.calculateQualityScore(itemWithConfidence);
        return {
            ...item,
            ...(freshness && { freshness }),
            confidence,
            qualityScore,
        };
    }
    async enrichEvidenceItems(items, places) {
        return Promise.all(items.map(async (item) => {
            const place = item.poiId && places
                ? places.get(parseInt(item.poiId))
                : undefined;
            return this.enrichEvidenceItem(item, place);
        }));
    }
};
exports.EvidenceManagementService = EvidenceManagementService;
exports.EvidenceManagementService = EvidenceManagementService = EvidenceManagementService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [evidence_freshness_calculator_service_1.EvidenceFreshnessCalculator,
        evidence_confidence_calculator_service_1.EvidenceConfidenceCalculator,
        evidence_quality_scorer_service_1.EvidenceQualityScorer])
], EvidenceManagementService);
//# sourceMappingURL=evidence-management.service.js.map