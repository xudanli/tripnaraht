"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationScoringService = void 0;
const common_1 = require("@nestjs/common");
let ValidationScoringService = class ValidationScoringService {
    calculateOverallScore(factors) {
        const weights = {
            factCheck: 0.3,
            credibility: 0.2,
            freshness: 0.15,
            completeness: 0.15,
            consistency: 0.1,
            similarity: 0.1,
        };
        const factCheckScore = factors.factCheck === 'pass' ? 1.0 :
            factors.factCheck === 'fail' ? 0.0 : 0.5;
        const consistencyScore = factors.consistency === 'consistent' ? 1.0 :
            factors.consistency === 'inconsistent' ? 0.0 : 0.5;
        const overallScore = factCheckScore * weights.factCheck +
            factors.credibility * weights.credibility +
            factors.freshness * weights.freshness +
            factors.completeness * weights.completeness +
            consistencyScore * weights.consistency +
            factors.similarity * weights.similarity;
        return Math.max(0, Math.min(1, overallScore));
    }
    calculateQualityScore(factors) {
        return (factors.credibility * 0.4 +
            factors.freshness * 0.3 +
            factors.completeness * 0.3);
    }
    calculateCredibilityScore(factors) {
        return factors.credibility;
    }
};
exports.ValidationScoringService = ValidationScoringService;
exports.ValidationScoringService = ValidationScoringService = __decorate([
    (0, common_1.Injectable)()
], ValidationScoringService);
//# sourceMappingURL=validation-scoring.service.js.map