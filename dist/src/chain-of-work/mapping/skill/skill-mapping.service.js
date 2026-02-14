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
var SkillMappingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillMappingService = void 0;
const common_1 = require("@nestjs/common");
const skills_registry_service_1 = require("../../../skills/services/skills-registry.service");
let SkillMappingService = SkillMappingService_1 = class SkillMappingService {
    constructor(skillsRegistry) {
        this.skillsRegistry = skillsRegistry;
        this.logger = new common_1.Logger(SkillMappingService_1.name);
        this.cache = new Map();
    }
    async mapStepToSkills(step, context) {
        this.logger.debug(`[SkillMapping] 开始映射步骤到 Skills: step_id=${step.id}, step_type=${step.step_type}`);
        const cacheKey = this.getCacheKey(step);
        const cached = this.cache.get(cacheKey);
        if (cached) {
            this.logger.debug(`[SkillMapping] 使用缓存结果: ${cached.length} 个匹配`);
            return cached;
        }
        const skills = this.skillsRegistry.getAllSkills();
        const matches = await Promise.all(skills.map(skill => this.calculateMatchScore(step, skill)));
        const topMatches = matches
            .filter(m => m.score > 0.5)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(m => {
            var _a;
            return ({
                step_id: step.id,
                skill_name: ((_a = m.skill.metadata) === null || _a === void 0 ? void 0 : _a.name) || 'unknown',
                confidence: m.score,
                matching_reason: this.explainMatch(step, m.skill),
            });
        });
        this.cache.set(cacheKey, topMatches);
        this.logger.debug(`[SkillMapping] 映射完成: ${topMatches.length} 个匹配`);
        return topMatches;
    }
    async calculateMatchScore(step, skill) {
        const keywordScore = this.keywordMatch(step, skill);
        const typeScore = this.typeMatch(step, skill);
        const score = keywordScore * 0.7 + typeScore * 0.3;
        return { skill, score };
    }
    keywordMatch(step, skill) {
        var _a, _b;
        const stepText = `${step.title} ${step.description}`.toLowerCase();
        const skillName = (((_a = skill.metadata) === null || _a === void 0 ? void 0 : _a.name) || '').toLowerCase();
        const skillDesc = (((_b = skill.metadata) === null || _b === void 0 ? void 0 : _b.description) || '').toLowerCase();
        const keywords = skillName.split('.').concat(skillDesc.split(' '));
        let matchCount = 0;
        for (const keyword of keywords) {
            if (keyword.length > 2 && stepText.includes(keyword)) {
                matchCount++;
            }
        }
        return Math.min(matchCount / Math.max(keywords.length, 1), 1);
    }
    typeMatch(step, skill) {
        var _a;
        if (step.step_type === 'RESEARCH') {
            const dataCollectionKeywords = ['search', 'get', 'find', 'query', 'fetch'];
            const skillName = (((_a = skill.metadata) === null || _a === void 0 ? void 0 : _a.name) || '').toLowerCase();
            for (const keyword of dataCollectionKeywords) {
                if (skillName.includes(keyword)) {
                    return 0.8;
                }
            }
        }
        return 0.3;
    }
    explainMatch(step, skill) {
        var _a;
        const skillName = ((_a = skill.metadata) === null || _a === void 0 ? void 0 : _a.name) || 'unknown';
        return `步骤 "${step.title}" 匹配到 Skill "${skillName}"，基于关键词和类型匹配`;
    }
    getCacheKey(step) {
        return `${step.step_type}:${step.title}:${step.description}`;
    }
};
exports.SkillMappingService = SkillMappingService;
exports.SkillMappingService = SkillMappingService = SkillMappingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [skills_registry_service_1.SkillsRegistryService])
], SkillMappingService);
//# sourceMappingURL=skill-mapping.service.js.map