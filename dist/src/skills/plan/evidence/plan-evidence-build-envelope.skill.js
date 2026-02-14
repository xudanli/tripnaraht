"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PlanEvidenceBuildEnvelopeSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanEvidenceBuildEnvelopeSkill = void 0;
const common_1 = require("@nestjs/common");
let PlanEvidenceBuildEnvelopeSkill = PlanEvidenceBuildEnvelopeSkill_1 = class PlanEvidenceBuildEnvelopeSkill {
    constructor() {
        this.logger = new common_1.Logger(PlanEvidenceBuildEnvelopeSkill_1.name);
        this.metadata = {
            name: 'plan.evidence.buildEnvelope',
            description: '统一 Evidence 结构，让所有结论可解释、可审计、可对比',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 plan.evidence.buildEnvelope: source=${input.source_title}`);
        try {
            const envelope = {
                source_title: input.source_title,
                source_url: input.source_url,
                publisher: input.publisher,
                published_at: input.published_at,
                retrieved_at: new Date().toISOString(),
                excerpt: input.excerpt,
                relevance: input.relevance,
                confidence: input.confidence || 'MEDIUM',
                data_timestamp: input.data_timestamp,
            };
            return {
                envelope,
            };
        }
        catch (error) {
            this.logger.error(`构建证据信封失败: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.PlanEvidenceBuildEnvelopeSkill = PlanEvidenceBuildEnvelopeSkill;
exports.PlanEvidenceBuildEnvelopeSkill = PlanEvidenceBuildEnvelopeSkill = PlanEvidenceBuildEnvelopeSkill_1 = __decorate([
    (0, common_1.Injectable)()
], PlanEvidenceBuildEnvelopeSkill);
//# sourceMappingURL=plan-evidence-build-envelope.skill.js.map