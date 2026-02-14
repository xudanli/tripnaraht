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
var ToolsSelectSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolsSelectSkill = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const skills_registry_service_1 = require("../services/skills-registry.service");
const embedding_service_1 = require("../../places/services/embedding.service");
let ToolsSelectSkill = ToolsSelectSkill_1 = class ToolsSelectSkill {
    constructor(moduleRef, embeddingService) {
        this.moduleRef = moduleRef;
        this.embeddingService = embeddingService;
        this.logger = new common_1.Logger(ToolsSelectSkill_1.name);
        this.metadata = {
            name: 'tools.select',
            description: '工具选择（Tool RAG）：根据用户请求、规划阶段和当前状态，推荐 3-5 个最相关的工具',
            version: '1.0.0',
            category: 'rag',
            toolGroup: 'CONTEXT',
        };
        this.skillEmbeddingsCache = new Map();
        this.cacheEnabled = true;
        if (this.embeddingService) {
            this.logger.log('Tool RAG Embedding 已启用，将使用向量检索');
        }
        else {
            this.logger.warn('EmbeddingService 未注入，Tool RAG 将降级到规则匹配');
        }
    }
    getSkillsRegistry() {
        if (!this.skillsRegistry) {
            try {
                this.skillsRegistry = this.moduleRef.get(skills_registry_service_1.SkillsRegistryService, { strict: false });
            }
            catch (error) {
                this.logger.error('无法获取 SkillsRegistryService，tools.select 功能将不可用');
                throw new Error('SkillsRegistryService 未注入，tools.select 功能不可用');
            }
        }
        return this.skillsRegistry;
    }
    async execute(input) {
        this.logger.debug(`执行 tools.select: phase=${input.planningPhase}, userQuery=${input.userQuery.substring(0, 50)}...`);
        try {
            const skillsRegistry = this.getSkillsRegistry();
            let allSkills = skillsRegistry.getAllSkills();
            if (input.toolGroupFilter && input.toolGroupFilter !== 'ALL') {
                allSkills = this.filterByToolGroup(allSkills, input.toolGroupFilter);
            }
            else if (input.excludeContextTools) {
                allSkills = this.filterByToolGroup(allSkills, 'DOMAIN');
            }
            const phaseTools = this.selectToolsByPhase(input.planningPhase, allSkills);
            let queryTools;
            if (this.embeddingService && this.cacheEnabled) {
                queryTools = await this.selectToolsByVectorSimilarity(input.userQuery, allSkills);
            }
            else {
                queryTools = this.selectToolsByQuery(input.userQuery, allSkills);
            }
            const candidateTools = this.mergeAndDeduplicate(phaseTools, queryTools);
            const selectedTools = this.rankAndSelect(candidateTools, input.userQuery, input.planningPhase, 5);
            const tools = selectedTools.map((skill) => ({
                name: skill.metadata.name,
                description: skill.metadata.description,
                schema: this.buildSimplifiedSchema(skill),
                suggestion: this.buildSuggestion(skill, input.userQuery, input.planningPhase),
                priority: this.calculatePriority(skill, input.userQuery, input.planningPhase),
                reason: this.buildReason(skill, input.userQuery, input.planningPhase),
            }));
            return {
                tools,
                totalTools: tools.length,
            };
        }
        catch (error) {
            this.logger.error(`工具选择失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    selectToolsByPhase(phase, allSkills) {
        const phaseToolMap = {
            planning: ['context.build', 'routeDirection.pickForIntent', 'world.buildContext'],
            decision: ['decision.abuCheck', 'decision.drdrePace', 'decision.neptuneRepair'],
            adjustment: ['decision.drdrePace', 'decision.neptuneRepair', 'plan.selectSlices'],
            repair: ['decision.neptuneRepair', 'plan.selectSlices'],
            readiness: ['readiness.generateChecklist', 'readiness.summarizeRisks'],
            countryPack: ['countryPack.newSkeleton', 'countryPack.validate'],
        };
        const phaseKey = phase.toLowerCase();
        const toolNames = phaseToolMap[phaseKey] || [];
        return allSkills.filter((skill) => toolNames.includes(skill.metadata.name));
    }
    selectToolsByQuery(userQuery, allSkills) {
        const queryLower = userQuery.toLowerCase();
        const keywords = {
            route: ['routeDirection.pickForIntent', 'routeDirection.listForCountry'],
            decision: ['decision.abuCheck', 'decision.drdrePace', 'decision.neptuneRepair'],
            checklist: ['readiness.generateChecklist'],
            country: ['countryPack.newSkeleton', 'countryPack.validate'],
            context: ['context.build', 'world.buildContext'],
            plan: ['plan.selectSlices'],
            tools: ['tools.select'],
        };
        const matchedToolNames = [];
        for (const [keyword, toolNames] of Object.entries(keywords)) {
            if (queryLower.includes(keyword)) {
                matchedToolNames.push(...toolNames);
            }
        }
        return allSkills.filter((skill) => matchedToolNames.includes(skill.metadata.name));
    }
    mergeAndDeduplicate(tools1, tools2) {
        const seen = new Set();
        const merged = [];
        for (const tool of [...tools1, ...tools2]) {
            const name = tool.metadata.name;
            if (!seen.has(name)) {
                seen.add(name);
                merged.push(tool);
            }
        }
        return merged;
    }
    async selectToolsByVectorSimilarity(userQuery, allSkills) {
        if (!this.embeddingService) {
            return this.selectToolsByQuery(userQuery, allSkills);
        }
        try {
            const queryEmbedding = await this.embeddingService.generateEmbedding(userQuery);
            const skillWithScores = await Promise.all(allSkills.map(async (skill) => {
                const cacheKey = `skill:${skill.metadata.name}:${skill.metadata.description}`;
                let skillEmbedding = this.skillEmbeddingsCache.get(cacheKey);
                if (!skillEmbedding) {
                    const skillText = `${skill.metadata.name} ${skill.metadata.description}`;
                    skillEmbedding = await this.embeddingService.generateEmbedding(skillText);
                    if (this.cacheEnabled) {
                        this.skillEmbeddingsCache.set(cacheKey, skillEmbedding);
                    }
                }
                const similarity = this.cosineSimilarity(queryEmbedding, skillEmbedding);
                return {
                    skill,
                    similarity,
                };
            }));
            skillWithScores.sort((a, b) => b.similarity - a.similarity);
            const threshold = 0.3;
            return skillWithScores
                .filter((item) => item.similarity >= threshold)
                .map((item) => item.skill);
        }
        catch (error) {
            this.logger.warn(`向量检索失败，降级到关键词匹配: ${error.message}`);
            return this.selectToolsByQuery(userQuery, allSkills);
        }
    }
    cosineSimilarity(vecA, vecB) {
        if (vecA.length !== vecB.length) {
            throw new Error('向量维度不匹配');
        }
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        if (denominator === 0) {
            return 0;
        }
        return dotProduct / denominator;
    }
    rankAndSelect(tools, userQuery, phase, k, skipReScoring = false) {
        if (skipReScoring && tools.length > 0) {
            return tools.slice(0, k);
        }
        const scored = tools.map((tool) => ({
            tool,
            score: this.calculatePriority(tool, userQuery, phase),
        }));
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, k).map((item) => item.tool);
    }
    calculatePriority(skill, userQuery, phase) {
        var _a;
        let score = 50;
        const phaseToolMap = {
            planning: ['context.build', 'routeDirection.pickForIntent'],
            decision: ['decision.abuCheck', 'decision.drdrePace'],
            adjustment: ['decision.drdrePace'],
            repair: ['decision.neptuneRepair'],
        };
        const phaseKey = phase.toLowerCase();
        if ((_a = phaseToolMap[phaseKey]) === null || _a === void 0 ? void 0 : _a.includes(skill.metadata.name)) {
            score += 30;
        }
        const queryLower = userQuery.toLowerCase();
        const descLower = skill.metadata.description.toLowerCase();
        if (queryLower.split(' ').some((word) => descLower.includes(word))) {
            score += 20;
        }
        return Math.min(100, score);
    }
    buildSimplifiedSchema(skill) {
        return {
            type: 'object',
            properties: {},
        };
    }
    buildSuggestion(skill, userQuery, phase) {
        return `根据当前阶段 "${phase}" 和用户请求，建议调用 ${skill.metadata.name} 来处理相关任务。`;
    }
    buildReason(skill, userQuery, phase) {
        const phaseMatch = this.selectToolsByPhase(phase, [skill]).length > 0;
        const queryMatch = this.selectToolsByQuery(userQuery, [skill]).length > 0;
        if (phaseMatch && queryMatch) {
            return `同时匹配规划阶段 "${phase}" 和用户请求关键词`;
        }
        else if (phaseMatch) {
            return `匹配规划阶段 "${phase}"`;
        }
        else if (queryMatch) {
            return '匹配用户请求关键词';
        }
        else {
            return '通用工具推荐';
        }
    }
    filterByToolGroup(skills, toolGroup) {
        return skills.filter((skill) => {
            const group = skill.metadata.toolGroup;
            if (!group) {
                const contextCategories = ['rag', 'world'];
                const isContext = contextCategories.includes(skill.metadata.category);
                return toolGroup === 'CONTEXT' ? isContext : !isContext;
            }
            return group === toolGroup;
        });
    }
};
exports.ToolsSelectSkill = ToolsSelectSkill;
exports.ToolsSelectSkill = ToolsSelectSkill = ToolsSelectSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(1, (0, common_1.Inject)(embedding_service_1.EmbeddingService)),
    __metadata("design:paramtypes", [core_1.ModuleRef,
        embedding_service_1.EmbeddingService])
], ToolsSelectSkill);
//# sourceMappingURL=tools-select.skill.js.map