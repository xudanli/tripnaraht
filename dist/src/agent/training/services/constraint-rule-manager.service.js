"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ConstraintRuleManagerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConstraintRuleManagerService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
let ConstraintRuleManagerService = ConstraintRuleManagerService_1 = class ConstraintRuleManagerService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(ConstraintRuleManagerService_1.name);
        this.rulesCache = new Map();
        this.rulesDir =
            this.configService.get('CONSTRAINT_RULES_DIR') ||
                path.join(process.cwd(), 'data', 'constraint-rules');
    }
    async loadRulesFromFile(type) {
        const fileName = `${type.toLowerCase()}_rules.json`;
        const filePath = path.join(this.rulesDir, fileName);
        try {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const rules = JSON.parse(fileContent);
            const validRules = rules.filter((rule) => this.validateRule(rule, type));
            this.logger.log(`[ConstraintRuleManager] 从文件加载规则: type=${type}, count=${validRules.length}`);
            return validRules;
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                this.logger.warn(`[ConstraintRuleManager] 规则文件不存在: ${filePath}，返回默认规则`);
                return this.getDefaultRules(type);
            }
            this.logger.error(`[ConstraintRuleManager] 加载规则失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            return this.getDefaultRules(type);
        }
    }
    async getGeographicRules() {
        const cacheKey = 'GEOGRAPHIC';
        if (this.rulesCache.has(cacheKey)) {
            return this.rulesCache.get(cacheKey);
        }
        const rules = await this.loadRulesFromFile('GEOGRAPHIC');
        this.rulesCache.set(cacheKey, rules);
        return rules;
    }
    async getTemporalRules() {
        const cacheKey = 'TEMPORAL';
        if (this.rulesCache.has(cacheKey)) {
            return this.rulesCache.get(cacheKey);
        }
        const rules = await this.loadRulesFromFile('TEMPORAL');
        this.rulesCache.set(cacheKey, rules);
        return rules;
    }
    async getComplianceRules() {
        const cacheKey = 'COMPLIANCE';
        if (this.rulesCache.has(cacheKey)) {
            return this.rulesCache.get(cacheKey);
        }
        const rules = await this.loadRulesFromFile('COMPLIANCE');
        this.rulesCache.set(cacheKey, rules);
        return rules;
    }
    async getUserPreferenceRules() {
        const cacheKey = 'USER_PREFERENCE';
        if (this.rulesCache.has(cacheKey)) {
            return this.rulesCache.get(cacheKey);
        }
        const rules = await this.loadRulesFromFile('USER_PREFERENCE');
        this.rulesCache.set(cacheKey, rules);
        return rules;
    }
    async addRule(rule) {
        const type = rule.type;
        const rules = await this.loadRulesFromFile(type);
        rules.push(rule);
        const fileName = `${type.toLowerCase()}_rules.json`;
        const filePath = path.join(this.rulesDir, fileName);
        await fs.mkdir(this.rulesDir, { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(rules, null, 2), 'utf-8');
        this.rulesCache.delete(type);
        this.logger.log(`[ConstraintRuleManager] 添加规则: type=${type}, id=${rule.id}`);
    }
    validateRule(rule, expectedType) {
        if (!rule.id || !rule.type || !rule.condition || !rule.severity) {
            return false;
        }
        if (rule.type !== expectedType) {
            return false;
        }
        return true;
    }
    getDefaultRules(type) {
        switch (type) {
            case 'GEOGRAPHIC':
                return [
                    {
                        id: 'geo_001',
                        type: 'GEOGRAPHIC',
                        name: 'High-risk destination restriction',
                        severity: 'HARD',
                        condition: JSON.stringify({ destination: { in: ['HIGH_RISK_AREA'] } }),
                        sev_level: 'SEV-1',
                        action: 'BLOCK',
                        metadata: { category: 'SAFETY', description: 'Block trips to high-risk destinations' },
                    },
                ];
            case 'TEMPORAL':
                return [
                    {
                        id: 'temp_001',
                        type: 'TEMPORAL',
                        name: 'Winter season warning',
                        severity: 'SOFT',
                        condition: JSON.stringify({ season: { eq: 'WINTER' }, destination: { eq: 'IS' } }),
                        sev_level: 'SEV-2',
                        action: 'WARN',
                        metadata: { category: 'SAFETY', description: 'Warn about winter travel risks' },
                    },
                ];
            case 'COMPLIANCE':
                return [
                    {
                        id: 'comp_001',
                        type: 'COMPLIANCE',
                        name: 'GDPR data handling',
                        severity: 'HARD',
                        condition: JSON.stringify({ user_location: { in: ['EU'] } }),
                        sev_level: 'SEV-1',
                        action: 'BLOCK',
                        metadata: { category: 'LEGAL', description: 'Ensure GDPR compliance for EU users' },
                    },
                ];
            case 'USER_PREFERENCE':
                return [
                    {
                        id: 'user_001',
                        type: 'USER_PREFERENCE',
                        name: 'Health restrictions',
                        severity: 'SOFT',
                        condition: JSON.stringify({ user_health_restrictions: { exists: true } }),
                        sev_level: 'SEV-3',
                        action: 'WARN',
                        metadata: { category: 'HEALTH', description: 'Respect user health restrictions' },
                    },
                ];
            default:
                return [];
        }
    }
    clearCache() {
        this.rulesCache.clear();
        this.logger.log('[ConstraintRuleManager] 规则缓存已清除');
    }
};
exports.ConstraintRuleManagerService = ConstraintRuleManagerService;
exports.ConstraintRuleManagerService = ConstraintRuleManagerService = ConstraintRuleManagerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], ConstraintRuleManagerService);
//# sourceMappingURL=constraint-rule-manager.service.js.map