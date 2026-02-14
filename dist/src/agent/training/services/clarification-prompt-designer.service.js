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
var ClarificationPromptDesignerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClarificationPromptDesignerService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
let ClarificationPromptDesignerService = ClarificationPromptDesignerService_1 = class ClarificationPromptDesignerService {
    constructor() {
        this.logger = new common_1.Logger(ClarificationPromptDesignerService_1.name);
        this.templates = new Map();
        this.initializeTemplates();
    }
    getPrompt(scenario, missingField, language = 'en') {
        const template = Array.from(this.templates.values()).find((t) => t.scenario === scenario && t.missing_field === missingField);
        if (!template) {
            this.logger.warn(`[ClarificationPrompt] 未找到匹配的模板: scenario=${scenario}, missingField=${missingField}`);
            return null;
        }
        return template;
    }
    createTemplate(template) {
        const fullTemplate = {
            ...template,
            template_id: `template_${(0, crypto_1.randomUUID)()}`,
        };
        this.templates.set(fullTemplate.template_id, fullTemplate);
        this.logger.log(`[ClarificationPrompt] 创建追问话术模板: templateId=${fullTemplate.template_id}`);
        return fullTemplate;
    }
    initializeTemplates() {
        this.createTemplate({
            scenario: 'MISSING_DESTINATION',
            missing_field: 'destination',
            templates: {
                en: {
                    question: 'Where would you like to travel?',
                    examples: ['Iceland', 'Japan', 'New Zealand'],
                    hints: ['You can specify a country, city, or region'],
                },
                zh: {
                    question: '您想去哪里旅行？',
                    examples: ['冰岛', '日本', '新西兰'],
                    hints: ['您可以指定国家、城市或地区'],
                },
            },
            metadata: {},
        });
        this.createTemplate({
            scenario: 'MISSING_DATE',
            missing_field: 'date_range',
            templates: {
                en: {
                    question: 'When would you like to travel?',
                    examples: ['June 2025', 'Next month', 'Summer 2025'],
                    hints: ['You can specify a date range or specific dates'],
                },
                zh: {
                    question: '您什么时候想旅行？',
                    examples: ['2025年6月', '下个月', '2025年夏天'],
                    hints: ['您可以指定日期范围或具体日期'],
                },
            },
            metadata: {},
        });
        this.createTemplate({
            scenario: 'MISSING_BUDGET',
            missing_field: 'budget',
            templates: {
                en: {
                    question: 'What is your budget for this trip?',
                    examples: ['$5000', 'Around $3000', 'Flexible'],
                    hints: ['You can specify a total budget or daily budget'],
                },
                zh: {
                    question: '您的旅行预算是多少？',
                    examples: ['5000美元', '大约3000美元', '灵活'],
                    hints: ['您可以指定总预算或每日预算'],
                },
            },
            metadata: {},
        });
    }
    listTemplates() {
        return Array.from(this.templates.values());
    }
};
exports.ClarificationPromptDesignerService = ClarificationPromptDesignerService;
exports.ClarificationPromptDesignerService = ClarificationPromptDesignerService = ClarificationPromptDesignerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], ClarificationPromptDesignerService);
//# sourceMappingURL=clarification-prompt-designer.service.js.map