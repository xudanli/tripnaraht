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
var RiskPromptDesignerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskPromptDesignerService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
let RiskPromptDesignerService = RiskPromptDesignerService_1 = class RiskPromptDesignerService {
    constructor() {
        this.logger = new common_1.Logger(RiskPromptDesignerService_1.name);
        this.templates = new Map();
        this.initializeTemplates();
    }
    getPrompt(sevLevel, category, reason, language = 'en') {
        const template = Array.from(this.templates.values()).find((t) => t.sev_level === sevLevel && t.category === category);
        if (!template) {
            this.logger.warn(`[RiskPrompt] 未找到匹配的模板: sevLevel=${sevLevel}, category=${category}`);
            return null;
        }
        const customizedTemplate = {
            ...template,
            templates: {
                en: {
                    ...template.templates.en,
                    message: template.templates.en.message.replace('{reason}', reason),
                },
                zh: {
                    ...template.templates.zh,
                    message: template.templates.zh.message.replace('{reason}', reason),
                },
            },
        };
        return customizedTemplate;
    }
    createTemplate(template) {
        const fullTemplate = {
            ...template,
            template_id: `template_${(0, crypto_1.randomUUID)()}`,
        };
        this.templates.set(fullTemplate.template_id, fullTemplate);
        this.logger.log(`[RiskPrompt] 创建风险提示模板: templateId=${fullTemplate.template_id}`);
        return fullTemplate;
    }
    initializeTemplates() {
        this.createTemplate({
            sev_level: 'SEV-1',
            category: 'SAFETY',
            templates: {
                en: {
                    title: '⚠️ Safety Risk Detected',
                    message: 'This route has been blocked due to critical safety concerns: {reason}. We cannot recommend this route.',
                    alternatives: [
                        'Consider a safer alternative route',
                        'Travel during a safer season',
                        'Use a guided tour service',
                    ],
                    actions: {
                        primary: 'View Alternative Routes',
                        secondary: 'Contact Support',
                    },
                },
                zh: {
                    title: '⚠️ 检测到安全风险',
                    message: '由于严重的安全问题，此路线已被阻止：{reason}。我们无法推荐此路线。',
                    alternatives: [
                        '考虑更安全的替代路线',
                        '在更安全的季节旅行',
                        '使用导游服务',
                    ],
                    actions: {
                        primary: '查看替代路线',
                        secondary: '联系支持',
                    },
                },
            },
            interaction: {
                require_confirmation: false,
                show_details: true,
                show_alternatives: true,
            },
        });
        this.createTemplate({
            sev_level: 'SEV-2',
            category: 'SAFETY',
            templates: {
                en: {
                    title: '⚠️ High Risk Warning',
                    message: 'This route has significant safety risks: {reason}. Please review carefully before proceeding.',
                    alternatives: [
                        'Consider safer alternatives',
                        'Travel with experienced guides',
                        'Check weather conditions',
                    ],
                    actions: {
                        primary: 'I Understand the Risks',
                        secondary: 'View Alternatives',
                    },
                },
                zh: {
                    title: '⚠️ 高风险警告',
                    message: '此路线存在重大安全风险：{reason}。请仔细审查后再继续。',
                    alternatives: [
                        '考虑更安全的替代方案',
                        '与经验丰富的导游一起旅行',
                        '检查天气条件',
                    ],
                    actions: {
                        primary: '我了解风险',
                        secondary: '查看替代方案',
                    },
                },
            },
            interaction: {
                require_confirmation: true,
                show_details: true,
                show_alternatives: true,
            },
        });
        this.createTemplate({
            sev_level: 'SEV-3',
            category: 'SAFETY',
            templates: {
                en: {
                    title: 'ℹ️ Safety Notice',
                    message: 'This route has some safety considerations: {reason}. Please be aware.',
                    actions: {
                        primary: 'Continue',
                        secondary: 'Learn More',
                    },
                },
                zh: {
                    title: 'ℹ️ 安全提示',
                    message: '此路线有一些安全考虑：{reason}。请注意。',
                    actions: {
                        primary: '继续',
                        secondary: '了解更多',
                    },
                },
            },
            interaction: {
                require_confirmation: false,
                show_details: false,
                show_alternatives: false,
            },
        });
        this.createTemplate({
            sev_level: 'SEV-4',
            category: 'SAFETY',
            templates: {
                en: {
                    title: 'ℹ️ Information',
                    message: '{reason}',
                    actions: {
                        primary: 'OK',
                    },
                },
                zh: {
                    title: 'ℹ️ 信息',
                    message: '{reason}',
                    actions: {
                        primary: '确定',
                    },
                },
            },
            interaction: {
                require_confirmation: false,
                show_details: false,
                show_alternatives: false,
            },
        });
    }
    listTemplates() {
        return Array.from(this.templates.values());
    }
};
exports.RiskPromptDesignerService = RiskPromptDesignerService;
exports.RiskPromptDesignerService = RiskPromptDesignerService = RiskPromptDesignerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], RiskPromptDesignerService);
//# sourceMappingURL=risk-prompt-designer.service.js.map