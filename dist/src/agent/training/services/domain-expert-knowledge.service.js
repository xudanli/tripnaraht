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
var DomainExpertKnowledgeService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DomainExpertKnowledgeService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
let DomainExpertKnowledgeService = DomainExpertKnowledgeService_1 = class DomainExpertKnowledgeService {
    constructor() {
        this.logger = new common_1.Logger(DomainExpertKnowledgeService_1.name);
        this.redLineRules = new Map();
        this.seasonalRisks = new Map();
        this.annotations = new Map();
        this.antiPatterns = new Map();
        this.initializeKnowledge();
    }
    addRedLineRule(rule) {
        const fullRule = {
            ...rule,
            rule_id: `rule_${(0, crypto_1.randomUUID)()}`,
        };
        this.redLineRules.set(fullRule.rule_id, fullRule);
        this.logger.log(`[DomainExpert] 添加红线规则: ruleId=${fullRule.rule_id}, name=${fullRule.name}`);
        return fullRule;
    }
    addSeasonalRisk(risk) {
        const fullRisk = {
            ...risk,
            risk_id: `risk_${(0, crypto_1.randomUUID)()}`,
        };
        this.seasonalRisks.set(fullRisk.risk_id, fullRisk);
        this.logger.log(`[DomainExpert] 添加季节性风险: riskId=${fullRisk.risk_id}, destination=${fullRisk.destination}`);
        return fullRisk;
    }
    addAnnotation(annotation) {
        const fullAnnotation = {
            ...annotation,
            annotation_id: `annotation_${(0, crypto_1.randomUUID)()}`,
        };
        this.annotations.set(fullAnnotation.annotation_id, fullAnnotation);
        this.logger.log(`[DomainExpert] 添加评测集标注: annotationId=${fullAnnotation.annotation_id}`);
        return fullAnnotation;
    }
    addAntiPattern(antiPattern) {
        const fullCase = {
            ...antiPattern,
            case_id: `case_${(0, crypto_1.randomUUID)()}`,
        };
        this.antiPatterns.set(fullCase.case_id, fullCase);
        this.logger.log(`[DomainExpert] 添加反例: caseId=${fullCase.case_id}, incidentType=${fullCase.incident_type}`);
        return fullCase;
    }
    getRedLineRules(destination) {
        let rules = Array.from(this.redLineRules.values());
        if (destination) {
            rules = rules.filter((r) => r.destination === destination);
        }
        return rules;
    }
    getSeasonalRisks(destination, month) {
        let risks = Array.from(this.seasonalRisks.values());
        if (destination) {
            risks = risks.filter((r) => r.destination === destination);
        }
        if (month !== undefined) {
            risks = risks.filter((r) => r.risk_months.includes(month));
        }
        return risks;
    }
    initializeKnowledge() {
        this.addRedLineRule({
            name: '冰岛冬季极端天气禁止',
            destination: 'IS',
            condition: 'season === "WINTER" AND weather.wind_speed > 20',
            action: 'BLOCK',
            sev_level: 'SEV-1',
            description: '冰岛冬季极端天气条件下禁止户外活动',
            examples: ['风速超过20m/s的冬季路线'],
        });
        this.addSeasonalRisk({
            destination: 'IS',
            risk_months: [11, 12, 1, 2, 3],
            risk_type: 'WEATHER',
            description: '冰岛冬季极端天气风险',
            mitigation_measures: [
                '检查天气预报',
                '准备应急装备',
                '考虑使用导游服务',
            ],
            sev_level: 'SEV-2',
        });
        this.addAntiPattern({
            incident_type: '极端天气事故',
            description: '游客在极端天气条件下被困',
            root_cause: '未充分考虑天气风险',
            pattern: '高风险季节 + 缺乏准备 + 独自旅行',
            prevention_measures: [
                '加强天气风险评估',
                '要求用户确认风险',
                '提供应急方案',
            ],
            related_rules: [],
        });
    }
};
exports.DomainExpertKnowledgeService = DomainExpertKnowledgeService;
exports.DomainExpertKnowledgeService = DomainExpertKnowledgeService = DomainExpertKnowledgeService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], DomainExpertKnowledgeService);
//# sourceMappingURL=domain-expert-knowledge.service.js.map