"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var CapabilityPackEvaluatorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CapabilityPackEvaluatorService = void 0;
const common_1 = require("@nestjs/common");
const rule_engine_1 = require("../engine/rule-engine");
const i18n_utils_1 = require("../utils/i18n.utils");
let CapabilityPackEvaluatorService = CapabilityPackEvaluatorService_1 = class CapabilityPackEvaluatorService {
    constructor() {
        this.logger = new common_1.Logger(CapabilityPackEvaluatorService_1.name);
        this.ruleEngine = new rule_engine_1.RuleEngine();
    }
    evaluatePack(pack, context) {
        const triggered = this.evaluateTrigger(pack.trigger, context);
        if (!triggered) {
            return {
                packType: pack.type,
                triggered: false,
                rules: [],
                hazards: [],
            };
        }
        const rules = pack.rules
            .filter(rule => {
            if (rule.appliesTo) {
                if (rule.appliesTo.seasons && context.itinerary.season) {
                    if (!rule.appliesTo.seasons.includes(context.itinerary.season)) {
                        return false;
                    }
                }
                if (rule.appliesTo.activities && context.itinerary.activities) {
                    const hasMatchingActivity = rule.appliesTo.activities.some(a => { var _a; return (_a = context.itinerary.activities) === null || _a === void 0 ? void 0 : _a.includes(a); });
                    if (!hasMatchingActivity) {
                        return false;
                    }
                }
            }
            const condition = this.convertCapabilityConditionToCondition(rule.when);
            return this.ruleEngine.evaluate(condition, context);
        })
            .map(rule => ({
            id: rule.id,
            triggered: true,
            level: rule.then.level,
            message: typeof rule.then.message === 'string' ? rule.then.message : (0, i18n_utils_1.getLocalizedText)(rule.then.message),
        }));
        const hazards = (pack.hazards || []).map(h => ({
            type: h.type,
            severity: h.severity,
            summary: typeof h.summary === 'string' ? h.summary : (0, i18n_utils_1.getLocalizedText)(h.summary),
        }));
        return {
            packType: pack.type,
            triggered: true,
            rules,
            hazards,
        };
    }
    convertToReadinessPack(pack, destinationId, geo) {
        var _a;
        const rules = pack.rules.map(rule => ({
            id: rule.id,
            category: rule.category,
            severity: rule.severity,
            appliesTo: rule.appliesTo
                ? {
                    seasons: rule.appliesTo.seasons,
                    activities: rule.appliesTo.activities,
                    travelerTags: rule.appliesTo.travelerTags,
                }
                : undefined,
            when: this.convertCapabilityConditionToCondition(rule.when),
            then: rule.then,
            evidence: rule.evidence,
            notes: rule.notes,
        }));
        const hazards = (_a = pack.hazards) === null || _a === void 0 ? void 0 : _a.map(h => ({
            type: h.type,
            severity: h.severity,
            summary: h.summary,
            mitigations: h.mitigations,
        }));
        return {
            packId: `capability.${pack.type}`,
            destinationId,
            displayName: pack.displayName,
            version: '1.0.0',
            lastReviewedAt: new Date().toISOString(),
            geo: {
                countryCode: destinationId.split('-')[0] || 'XX',
                region: 'Multiple',
                city: 'Multiple',
            },
            supportedSeasons: ['all'],
            rules,
            checklists: [],
            hazards,
        };
    }
    evaluateTrigger(trigger, context) {
        if (trigger.all) {
            return trigger.all.every(condition => this.evaluateCondition(condition, context));
        }
        if (trigger.any) {
            return trigger.any.some(condition => this.evaluateCondition(condition, context));
        }
        if (trigger.not) {
            return !this.evaluateCondition(trigger.not, context);
        }
        return false;
    }
    evaluateCondition(condition, context) {
        if (condition.all) {
            return condition.all.every(c => this.evaluateCondition(c, context));
        }
        if (condition.any) {
            return condition.any.some(c => this.evaluateCondition(c, context));
        }
        if (condition.not) {
            return !this.evaluateCondition(condition.not, context);
        }
        if (condition.geoPath) {
            const value = this.getPathValue(context, condition.geoPath);
            return this.compareValue(value, condition.operator, condition.value);
        }
        if (condition.contextPath) {
            const value = this.getPathValue(context, condition.contextPath);
            return this.compareValue(value, condition.operator, condition.value);
        }
        return false;
    }
    getPathValue(context, path) {
        const parts = path.split('.');
        let value = context;
        for (const part of parts) {
            if (value === null || value === undefined) {
                return undefined;
            }
            value = value[part];
        }
        return value;
    }
    compareValue(actual, operator, expected) {
        if (operator === 'exists') {
            return actual !== undefined && actual !== null;
        }
        if (operator === 'eq') {
            return actual === expected;
        }
        if (operator === 'gt') {
            return typeof actual === 'number' && actual > expected;
        }
        if (operator === 'gte') {
            return typeof actual === 'number' && actual >= expected;
        }
        if (operator === 'lt') {
            return typeof actual === 'number' && actual < expected;
        }
        if (operator === 'lte') {
            return typeof actual === 'number' && actual <= expected;
        }
        if (operator === 'in') {
            return Array.isArray(expected) && expected.includes(actual);
        }
        if (operator === 'containsAny') {
            if (!Array.isArray(actual)) {
                return false;
            }
            return Array.isArray(expected) && expected.some(v => actual.includes(v));
        }
        return false;
    }
    convertCapabilityConditionToCondition(condition) {
        if (condition.all) {
            return {
                all: condition.all.map(c => this.convertCapabilityConditionToCondition(c)),
            };
        }
        if (condition.any) {
            return {
                any: condition.any.map(c => this.convertCapabilityConditionToCondition(c)),
            };
        }
        if (condition.not) {
            return {
                not: this.convertCapabilityConditionToCondition(condition.not),
            };
        }
        const path = condition.geoPath || condition.contextPath;
        if (path && condition.operator && condition.value !== undefined) {
            const operator = condition.operator;
            const value = condition.value;
            switch (operator) {
                case 'eq':
                    return { eq: { path, value } };
                case 'ne':
                    return { ne: { path, value } };
                case 'gt':
                    return { gt: { path, value: value } };
                case 'gte':
                    return { gte: { path, value: value } };
                case 'lt':
                    return { lt: { path, value: value } };
                case 'lte':
                    return { lte: { path, value: value } };
                case 'in':
                    return { in: { path, values: Array.isArray(value) ? value : [value] } };
                case 'exists':
                    return { exists: path };
                default:
                    return { eq: { path, value } };
            }
        }
        return { eq: { path: '__never__', value: '__never__' } };
    }
};
exports.CapabilityPackEvaluatorService = CapabilityPackEvaluatorService;
exports.CapabilityPackEvaluatorService = CapabilityPackEvaluatorService = CapabilityPackEvaluatorService_1 = __decorate([
    (0, common_1.Injectable)()
], CapabilityPackEvaluatorService);
//# sourceMappingURL=capability-pack-evaluator.service.js.map