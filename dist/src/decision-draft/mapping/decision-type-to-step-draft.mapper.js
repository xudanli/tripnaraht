"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DecisionTypeToStepDraftMapper_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionTypeToStepDraftMapper = void 0;
const common_1 = require("@nestjs/common");
let DecisionTypeToStepDraftMapper = DecisionTypeToStepDraftMapper_1 = class DecisionTypeToStepDraftMapper {
    constructor() {
        this.logger = new common_1.Logger(DecisionTypeToStepDraftMapper_1.name);
        this.mappingRules = {
            'transport-decision': {
                decision_type: 'transport-decision',
                step_types: ['RESEARCH', 'GATE_EVAL'],
                required_skills: ['transport.search', 'poi.search'],
                sub_agent: 'Gatekeeper',
                guardian: 'ABU',
            },
            'pace-decision': {
                decision_type: 'pace-decision',
                step_types: ['PLAN_GEN', 'VERIFY'],
                required_skills: ['dem.getProfile'],
                sub_agent: 'CoreDecision',
                guardian: 'DR_DRE',
            },
            'poi-selection': {
                decision_type: 'poi-selection',
                step_types: ['RESEARCH', 'PLAN_GEN'],
                required_skills: ['poi.search', 'opening_hours.get'],
                sub_agent: 'Planner',
                guardian: undefined,
            },
            'route-optimization': {
                decision_type: 'route-optimization',
                step_types: ['PLAN_GEN', 'VERIFY'],
                required_skills: [],
                sub_agent: 'CoreDecision',
                guardian: 'DR_DRE',
            },
            'weather-strategy': {
                decision_type: 'weather-strategy',
                step_types: ['RESEARCH', 'REPAIR'],
                required_skills: ['weather.get'],
                sub_agent: 'LocalInsight',
                guardian: 'NEPTUNE',
            },
            'budget-balance': {
                decision_type: 'budget-balance',
                step_types: ['PLAN_GEN', 'VERIFY'],
                required_skills: [],
                sub_agent: 'Planner',
                guardian: undefined,
            },
        };
    }
    getStepTypes(decisionType) {
        const rule = this.mappingRules[decisionType];
        if (!rule) {
            this.logger.warn(`[DecisionTypeMapper] 未知的决策类型: ${decisionType}`);
            return [];
        }
        return rule.step_types;
    }
    getRequiredSkills(decisionType) {
        const rule = this.mappingRules[decisionType];
        if (!rule) {
            return [];
        }
        return rule.required_skills;
    }
    getSubAgent(decisionType) {
        const rule = this.mappingRules[decisionType];
        if (!rule) {
            return null;
        }
        return rule.sub_agent;
    }
    getGuardian(decisionType) {
        const rule = this.mappingRules[decisionType];
        if (!rule || !rule.guardian) {
            return null;
        }
        return rule.guardian;
    }
    getMappingRule(decisionType) {
        return this.mappingRules[decisionType] || null;
    }
    getAllMappingRules() {
        return Object.values(this.mappingRules);
    }
};
exports.DecisionTypeToStepDraftMapper = DecisionTypeToStepDraftMapper;
exports.DecisionTypeToStepDraftMapper = DecisionTypeToStepDraftMapper = DecisionTypeToStepDraftMapper_1 = __decorate([
    (0, common_1.Injectable)()
], DecisionTypeToStepDraftMapper);
//# sourceMappingURL=decision-type-to-step-draft.mapper.js.map