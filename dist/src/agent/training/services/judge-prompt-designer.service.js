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
var JudgePromptDesignerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.JudgePromptDesignerService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
let JudgePromptDesignerService = JudgePromptDesignerService_1 = class JudgePromptDesignerService {
    constructor() {
        this.logger = new common_1.Logger(JudgePromptDesignerService_1.name);
        this.templates = new Map();
        this.initializeTemplates();
    }
    getTemplate(templateId) {
        if (templateId) {
            return this.templates.get(templateId) || null;
        }
        return Array.from(this.templates.values())[0] || null;
    }
    createTemplate(template) {
        const fullTemplate = {
            ...template,
            template_id: `template_${(0, crypto_1.randomUUID)()}`,
        };
        this.templates.set(fullTemplate.template_id, fullTemplate);
        this.logger.log(`[JudgePromptDesigner] 创建Judge Prompt模板: templateId=${fullTemplate.template_id}`);
        return fullTemplate;
    }
    initializeTemplates() {
        this.createTemplate({
            name: 'Quality Score Judge',
            scoring_criteria: [
                {
                    criterion: 'Executability',
                    weight: 0.3,
                    description: '规划是否可执行（时间、地点、可达性）',
                },
                {
                    criterion: 'Safety',
                    weight: 0.3,
                    description: '规划是否安全（风险评估、合规性）',
                },
                {
                    criterion: 'User Satisfaction',
                    weight: 0.2,
                    description: '规划是否满足用户需求',
                },
                {
                    criterion: 'Evidence Quality',
                    weight: 0.2,
                    description: '证据是否充分和可靠',
                },
            ],
            prompt_template: `You are a quality judge for trip planning. Evaluate the following plan and provide a score from 0 to 1.

Plan: {plan}
User Request: {user_request}
Evidence: {evidence}

Scoring Criteria:
1. Executability (30%): Is the plan executable? (time windows, locations, accessibility)
2. Safety (30%): Is the plan safe? (risk assessment, compliance)
3. User Satisfaction (20%): Does the plan meet user needs?
4. Evidence Quality (20%): Is the evidence sufficient and reliable?

Provide:
- Overall score (0-1)
- Scores for each criterion
- Reasoning
- Diagnostic labels (if any issues detected)`,
            calibration_examples: [
                {
                    input: {
                        plan: 'A well-structured 3-day itinerary with verified POIs',
                        user_request: 'Plan a trip to Iceland',
                        evidence: 'Complete evidence chain',
                    },
                    expected_score: 0.9,
                    reasoning: 'High executability, safe, meets user needs, strong evidence',
                },
            ],
        });
    }
    listTemplates() {
        return Array.from(this.templates.values());
    }
};
exports.JudgePromptDesignerService = JudgePromptDesignerService;
exports.JudgePromptDesignerService = JudgePromptDesignerService = JudgePromptDesignerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], JudgePromptDesignerService);
//# sourceMappingURL=judge-prompt-designer.service.js.map