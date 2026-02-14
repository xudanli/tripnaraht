"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DetailShowEvidenceSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DetailShowEvidenceSkill = void 0;
const common_1 = require("@nestjs/common");
let DetailShowEvidenceSkill = DetailShowEvidenceSkill_1 = class DetailShowEvidenceSkill {
    constructor() {
        this.logger = new common_1.Logger(DetailShowEvidenceSkill_1.name);
        this.metadata = {
            name: 'detail.showEvidence',
            description: '展示证据（基于证据引用），让用户了解决策依据',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        var _a;
        this.logger.debug(`执行 detail.showEvidence: tripId=${input.tripId}`);
        try {
            const evidenceRefs = ((_a = input.planState) === null || _a === void 0 ? void 0 : _a.evidence_refs) || [];
            const evidence = evidenceRefs.map((env, index) => ({
                id: `evidence_${index}`,
                source: env.source_title,
                excerpt: env.excerpt,
                relevance: env.relevance,
                confidence: env.confidence,
            }));
            if (input.evidenceRefs && input.evidenceRefs.length > 0) {
            }
            return {
                evidence,
            };
        }
        catch (error) {
            this.logger.error(`展示证据失败: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.DetailShowEvidenceSkill = DetailShowEvidenceSkill;
exports.DetailShowEvidenceSkill = DetailShowEvidenceSkill = DetailShowEvidenceSkill_1 = __decorate([
    (0, common_1.Injectable)()
], DetailShowEvidenceSkill);
//# sourceMappingURL=detail-show-evidence.skill.js.map