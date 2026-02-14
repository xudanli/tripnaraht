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
var ConstraintsEngineService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConstraintsEngineService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const constraint_rule_manager_service_1 = require("./constraint-rule-manager.service");
let ConstraintsEngineService = ConstraintsEngineService_1 = class ConstraintsEngineService {
    constructor(prisma, ruleManager) {
        this.prisma = prisma;
        this.ruleManager = ruleManager;
        this.logger = new common_1.Logger(ConstraintsEngineService_1.name);
        this.rules = [];
    }
    async loadRules() {
        if (this.ruleManager) {
            try {
                const geographicRules = await this.ruleManager.getGeographicRules();
                const temporalRules = await this.ruleManager.getTemporalRules();
                const complianceRules = await this.ruleManager.getComplianceRules();
                const userPreferenceRules = await this.ruleManager.getUserPreferenceRules();
                return [
                    ...geographicRules,
                    ...temporalRules,
                    ...complianceRules,
                    ...userPreferenceRules,
                ];
            }
            catch (error) {
                this.logger.warn(`[ConstraintsEngine] 加载规则失败，使用空规则集: ${error === null || error === void 0 ? void 0 : error.message}`);
                return [];
            }
        }
        return [];
    }
    async checkConstraints(itinerary, context) {
        this.logger.debug(`[ConstraintsEngine] 检查约束: countryCode=${context.country_code}`);
        const violations = [];
        const warnings = [];
        const rules = await this.loadRules();
        for (const rule of rules.filter((r) => r.severity === 'HARD')) {
            const violation = await this.checkRule(rule, itinerary, context);
            if (violation) {
                violations.push(violation);
            }
        }
        for (const rule of rules.filter((r) => r.severity === 'SOFT')) {
            const warning = await this.checkRuleAsWarning(rule, itinerary, context);
            if (warning) {
                warnings.push(warning);
            }
        }
        const sevLevel = this.determineSevLevel(violations, warnings);
        const isBlocked = violations.length > 0 || sevLevel === 'SEV-1';
        const requiresApproval = sevLevel === 'SEV-2' || violations.some((v) => v.sev_level === 'SEV-2');
        const result = {
            violations,
            warnings,
            is_blocked: isBlocked,
            sev_level: sevLevel,
            requires_approval: requiresApproval,
        };
        this.logger.debug(`[ConstraintsEngine] 约束检查完成: violations=${violations.length}, warnings=${warnings.length}, sevLevel=${sevLevel}`);
        return result;
    }
    async checkRule(rule, itinerary, context) {
        try {
            switch (rule.type) {
                case 'GEOGRAPHIC':
                    return await this.checkGeographicConstraint(rule, itinerary, context);
                case 'TEMPORAL':
                    return await this.checkTemporalConstraint(rule, itinerary, context);
                case 'COMPLIANCE':
                    return await this.checkComplianceConstraint(rule, itinerary, context);
                case 'USER_PREFERENCE':
                    return await this.checkUserPreferenceConstraint(rule, itinerary, context);
                default:
                    return null;
            }
        }
        catch (error) {
            this.logger.warn(`[ConstraintsEngine] 规则检查失败: ruleId=${rule.id}, error=${error === null || error === void 0 ? void 0 : error.message}`);
            return null;
        }
    }
    async checkRuleAsWarning(rule, itinerary, context) {
        const violation = await this.checkRule(rule, itinerary, context);
        if (violation) {
            return {
                rule_id: violation.rule_id,
                rule_name: violation.rule_name,
                type: violation.type,
                message: violation.message,
                details: violation.details,
                timestamp: violation.timestamp,
            };
        }
        return null;
    }
    async checkGeographicConstraint(rule, itinerary, context) {
        return null;
    }
    async checkTemporalConstraint(rule, itinerary, context) {
        return null;
    }
    async checkComplianceConstraint(rule, itinerary, context) {
        return null;
    }
    async checkUserPreferenceConstraint(rule, itinerary, context) {
        return null;
    }
    determineSevLevel(violations, warnings) {
        if (violations.length === 0 && warnings.length === 0) {
            return 'SEV-4';
        }
        if (violations.some((v) => v.sev_level === 'SEV-1')) {
            return 'SEV-1';
        }
        if (violations.some((v) => v.sev_level === 'SEV-2')) {
            return 'SEV-2';
        }
        if (violations.some((v) => v.sev_level === 'SEV-3')) {
            return 'SEV-3';
        }
        return 'SEV-4';
    }
    initializeRules() {
        this.rules.push({
            id: 'rule_001',
            name: '危险区域禁止',
            type: 'GEOGRAPHIC',
            severity: 'HARD',
            condition: '{}',
            action: 'BLOCK',
            sev_level: 'SEV-1',
        });
        this.rules.push({
            id: 'rule_002',
            name: '高风险季节警告',
            type: 'TEMPORAL',
            severity: 'SOFT',
            condition: '{}',
            action: 'WARN',
            sev_level: 'SEV-3',
        });
    }
    addRule(rule) {
        this.rules.push(rule);
        this.logger.log(`[ConstraintsEngine] 添加约束规则: ruleId=${rule.id}`);
    }
    getAllRules() {
        return [...this.rules];
    }
};
exports.ConstraintsEngineService = ConstraintsEngineService;
exports.ConstraintsEngineService = ConstraintsEngineService = ConstraintsEngineService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        constraint_rule_manager_service_1.ConstraintRuleManagerService])
], ConstraintsEngineService);
//# sourceMappingURL=constraints-engine.service.js.map