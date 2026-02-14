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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadinessChecker = void 0;
const common_1 = require("@nestjs/common");
const rule_engine_1 = require("./rule-engine");
const trip_context_types_1 = require("../types/trip-context.types");
const i18n_utils_1 = require("../utils/i18n.utils");
const risk_quantification_service_1 = require("../services/risk-quantification.service");
let ReadinessChecker = class ReadinessChecker {
    constructor(riskQuantificationService) {
        this.riskQuantificationService = riskQuantificationService;
        this.ruleEngine = new rule_engine_1.RuleEngine();
    }
    checkDestination(pack, context, lang = 'en') {
        const enhancedContext = this.enhanceContext(context);
        const blockers = [];
        const must = [];
        const should = [];
        const optional = [];
        for (const rule of pack.rules) {
            if (!this.ruleEngine.isRuleApplicable(rule, enhancedContext)) {
                continue;
            }
            if (!rule.when) {
                continue;
            }
            if (this.ruleEngine.evaluate(rule.when, enhancedContext)) {
                const item = this.ruleToFindingItem(rule, lang);
                if (rule.then.level === 'blocker') {
                    blockers.push(item);
                }
                else if (rule.then.level === 'must') {
                    must.push(item);
                }
                else if (rule.then.level === 'should') {
                    should.push(item);
                }
                else if (rule.then.level === 'optional') {
                    optional.push(item);
                }
            }
        }
        const packSources = (pack.sources || []).map(s => ({
            sourceId: s.sourceId,
            authority: s.authority,
            type: s.type,
            title: (0, i18n_utils_1.getLocalizedText)(s.title, lang) || s.authority,
            canonicalUrl: s.canonicalUrl,
        }));
        const risks = (pack.hazards || []).map(h => ({
            type: h.type,
            severity: h.severity,
            summary: (0, i18n_utils_1.getLocalizedText)(h.summary, lang),
            mitigations: (0, i18n_utils_1.getLocalizedTexts)(h.mitigations || [], lang),
            sources: packSources,
            quantification: this.riskQuantificationService
                ? this.riskQuantificationService.quantifyRisk(h.type, h.severity, enhancedContext, lang)
                : undefined,
        }));
        const missingInfo = [];
        for (const item of [...blockers, ...must, ...should]) {
            if (item.askUser) {
                if (Array.isArray(item.askUser)) {
                    if (item.askUser.length > 0) {
                        if (typeof item.askUser[0] === 'string') {
                            missingInfo.push(...item.askUser);
                        }
                        else {
                            const questions = item.askUser;
                            questions.forEach(q => {
                                const text = typeof q.text === 'string' ? q.text : (q.text.zh || q.text.en || '');
                                if (text) {
                                    missingInfo.push(text);
                                }
                            });
                        }
                    }
                }
            }
        }
        return {
            destinationId: pack.destinationId,
            packId: pack.packId,
            packVersion: pack.version,
            blockers,
            must,
            should,
            optional,
            risks,
            missingInfo: missingInfo.length > 0 ? missingInfo : undefined,
        };
    }
    checkMultipleDestinations(packs, context, lang = 'en') {
        const findings = packs.map(pack => this.checkDestination(pack, context, lang));
        const summary = {
            totalBlockers: findings.reduce((sum, f) => sum + f.blockers.length, 0),
            totalMust: findings.reduce((sum, f) => sum + f.must.length, 0),
            totalShould: findings.reduce((sum, f) => sum + f.should.length, 0),
            totalOptional: findings.reduce((sum, f) => sum + f.optional.length, 0),
            totalRisks: findings.reduce((sum, f) => sum + f.risks.length, 0),
        };
        return {
            findings,
            summary,
        };
    }
    enhanceContext(context) {
        const enhanced = { ...context };
        if (context.traveler.nationality) {
            enhanced.traveler.nationalityRequiresSchengen =
                (0, trip_context_types_1.requiresSchengenVisa)(context.traveler.nationality);
        }
        return enhanced;
    }
    ruleToFindingItem(rule, lang = 'en') {
        var _a, _b;
        return {
            id: rule.id,
            category: rule.category,
            severity: rule.severity,
            level: rule.then.level,
            message: (0, i18n_utils_1.getLocalizedText)(rule.then.message, lang),
            tasks: (_a = rule.then.tasks) === null || _a === void 0 ? void 0 : _a.map(task => ({
                ...task,
                title: (0, i18n_utils_1.getLocalizedText)(task.title, lang),
            })),
            askUser: rule.then.askUser ? (0, i18n_utils_1.getLocalizedTexts)(rule.then.askUser, lang) : undefined,
            evidence: (_b = rule.evidence) === null || _b === void 0 ? void 0 : _b.map(e => ({
                sourceId: e.sourceId,
                sectionId: e.sectionId,
                quote: e.quote,
            })),
        };
    }
};
exports.ReadinessChecker = ReadinessChecker;
exports.ReadinessChecker = ReadinessChecker = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [risk_quantification_service_1.RiskQuantificationService])
], ReadinessChecker);
//# sourceMappingURL=readiness-checker.js.map