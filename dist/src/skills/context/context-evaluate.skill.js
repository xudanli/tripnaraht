"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ContextEvaluateSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextEvaluateSkill = void 0;
const common_1 = require("@nestjs/common");
let ContextEvaluateSkill = ContextEvaluateSkill_1 = class ContextEvaluateSkill {
    constructor() {
        this.logger = new common_1.Logger(ContextEvaluateSkill_1.name);
        this.metadata = {
            name: 'context.evaluate',
            description: '上下文质量评估：计算命中率、噪音率、超预算率、压缩率、相关性得分等指标',
            version: '1.0.0',
            category: 'rag',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 context.evaluate: blocks=${input.contextPackage.blocks.length}, tokens=${input.contextPackage.totalTokens}`);
        try {
            const blocks = input.contextPackage.blocks;
            const totalBlocks = blocks.length;
            const publicBlocks = blocks.filter((b) => b.visibility === 'public').length;
            const privateBlocks = blocks.filter((b) => b.visibility === 'private').length;
            let hitRate;
            let usedBlocks;
            if (input.usedBlockKeys && input.usedBlockKeys.length > 0) {
                const usedSet = new Set(input.usedBlockKeys);
                usedBlocks = blocks.filter((b) => usedSet.has(b.key)).length;
                hitRate = usedBlocks / totalBlocks;
            }
            const noiseBlocks = blocks.filter((b) => b.priority < 30).length;
            const noiseRate = noiseBlocks / totalBlocks;
            const totalTokens = input.contextPackage.totalTokens;
            const tokenBudget = input.contextPackage.tokenBudget;
            const overBudgetRate = totalTokens / tokenBudget;
            const overBudget = overBudgetRate > 1;
            let compressionRate;
            let compressedBlocks;
            if (input.contextPackage.compressed && input.contextPackage.metadata) {
                const originalBlocks = input.contextPackage.metadata.originalBlocksCount;
                if (originalBlocks && originalBlocks > 0) {
                    compressedBlocks = totalBlocks;
                    compressionRate = compressedBlocks / originalBlocks;
                }
            }
            let relevanceScore;
            if (input.userQuery) {
                relevanceScore = this.calculateRelevanceScore(blocks, input.userQuery, input.phase);
            }
            const blockTypeDistribution = {};
            for (const block of blocks) {
                blockTypeDistribution[block.type] = (blockTypeDistribution[block.type] || 0) + 1;
            }
            const priorityDistribution = {
                high: blocks.filter((b) => b.priority >= 80).length,
                medium: blocks.filter((b) => b.priority >= 50 && b.priority < 80).length,
                low: blocks.filter((b) => b.priority < 50).length,
            };
            const metrics = {
                totalBlocks,
                publicBlocks,
                privateBlocks,
                usedBlocks,
                hitRate,
                noiseBlocks,
                noiseRate,
                totalTokens,
                tokenBudget,
                overBudgetRate,
                overBudget,
                compressedBlocks,
                compressionRate,
                relevanceScore,
                blockTypeDistribution,
                priorityDistribution,
            };
            const { quality, issues, suggestions } = this.evaluateQuality(metrics, input.contextPackage);
            return {
                metrics,
                summary: {
                    quality,
                    issues,
                    suggestions,
                },
            };
        }
        catch (error) {
            this.logger.error(`上下文评估失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    calculateRelevanceScore(blocks, userQuery, phase) {
        const queryLower = userQuery.toLowerCase();
        const queryWords = queryLower.split(/\s+/);
        let totalScore = 0;
        let blockCount = 0;
        for (const block of blocks) {
            let blockScore = block.priority;
            const blockTextLower = block.text.toLowerCase();
            const matchedWords = queryWords.filter((word) => blockTextLower.includes(word) || block.key.toLowerCase().includes(word));
            blockScore += matchedWords.length * 5;
            if (phase) {
                const phaseRelevantTypes = {
                    planning: ['WORLD_MODEL', 'COUNTRY_VISA', 'COUNTRY_SAFETY'],
                    decision: ['ABU_RULES', 'DECISION_LOG', 'COUNTRY_ROAD_RULES'],
                    adjustment: ['PLAN_DAY', 'PLAN_SEGMENT', 'DECISION_LOG'],
                    repair: ['REJECTION_LOG', 'PLAN_SEGMENT', 'DECISION_LOG'],
                };
                const phaseKey = phase.toLowerCase();
                const relevantTypes = phaseRelevantTypes[phaseKey] || [];
                if (relevantTypes.includes(block.type)) {
                    blockScore += 10;
                }
            }
            totalScore += Math.min(100, blockScore);
            blockCount++;
        }
        return blockCount > 0 ? Math.round(totalScore / blockCount) : 0;
    }
    evaluateQuality(metrics, contextPackage) {
        const issues = [];
        const suggestions = [];
        let score = 0;
        if (metrics.overBudget) {
            issues.push(`超预算 ${((metrics.overBudgetRate - 1) * 100).toFixed(1)}%`);
            suggestions.push('建议启用压缩或减少块数量');
            score -= 20;
        }
        else {
            score += 20;
        }
        if (metrics.noiseRate > 0.3) {
            issues.push(`噪音率过高: ${(metrics.noiseRate * 100).toFixed(1)}%`);
            suggestions.push('建议移除低优先级块或启用压缩');
            score -= 15;
        }
        else if (metrics.noiseRate > 0.1) {
            issues.push(`噪音率中等: ${(metrics.noiseRate * 100).toFixed(1)}%`);
            suggestions.push('可以考虑压缩低优先级块');
            score -= 5;
        }
        else {
            score += 15;
        }
        if (metrics.hitRate !== undefined) {
            if (metrics.hitRate < 0.5) {
                issues.push(`命中率较低: ${(metrics.hitRate * 100).toFixed(1)}%`);
                suggestions.push('建议优化块选择策略，提高相关性');
                score -= 15;
            }
            else if (metrics.hitRate < 0.7) {
                issues.push(`命中率中等: ${(metrics.hitRate * 100).toFixed(1)}%`);
                suggestions.push('可以考虑优化块选择');
                score -= 5;
            }
            else {
                score += 15;
            }
        }
        if (metrics.relevanceScore !== undefined) {
            if (metrics.relevanceScore < 50) {
                issues.push(`相关性得分较低: ${metrics.relevanceScore}`);
                suggestions.push('建议改进块选择算法，提高相关性');
                score -= 10;
            }
            else if (metrics.relevanceScore < 70) {
                issues.push(`相关性得分中等: ${metrics.relevanceScore}`);
                suggestions.push('可以考虑优化块选择');
                score -= 5;
            }
            else {
                score += 10;
            }
        }
        if (metrics.totalBlocks === 0) {
            issues.push('没有块，可能是构建失败');
            suggestions.push('检查 Context Package 构建逻辑');
            score -= 30;
        }
        else if (metrics.totalBlocks < 3) {
            issues.push('块数量过少，可能信息不足');
            suggestions.push('检查是否遗漏了必要的块');
            score -= 10;
        }
        else if (metrics.totalBlocks > 20) {
            issues.push('块数量过多，可能影响性能');
            suggestions.push('建议启用压缩或优化块选择');
            score -= 5;
        }
        else {
            score += 10;
        }
        if (metrics.compressionRate !== undefined) {
            if (metrics.compressionRate > 0.8) {
                issues.push(`压缩效果不明显: ${(metrics.compressionRate * 100).toFixed(1)}%`);
                suggestions.push('建议使用更激进的压缩策略');
                score -= 5;
            }
            else if (metrics.compressionRate < 0.3) {
                issues.push(`压缩过度: ${(metrics.compressionRate * 100).toFixed(1)}%`);
                suggestions.push('建议使用保守的压缩策略，避免丢失重要信息');
                score -= 10;
            }
        }
        if (metrics.publicBlocks === 0 && metrics.totalBlocks > 0) {
            issues.push('没有 Public 块，无法构建 prompt');
            suggestions.push('确保至少有一些 visibility="public" 的块');
            score -= 20;
        }
        let quality;
        if (score >= 70) {
            quality = 'EXCELLENT';
        }
        else if (score >= 50) {
            quality = 'GOOD';
        }
        else if (score >= 30) {
            quality = 'FAIR';
        }
        else {
            quality = 'POOR';
        }
        if (issues.length === 0) {
            suggestions.push('Context Package 质量良好，无需调整');
        }
        return {
            quality,
            issues,
            suggestions,
        };
    }
};
exports.ContextEvaluateSkill = ContextEvaluateSkill;
exports.ContextEvaluateSkill = ContextEvaluateSkill = ContextEvaluateSkill_1 = __decorate([
    (0, common_1.Injectable)()
], ContextEvaluateSkill);
//# sourceMappingURL=context-evaluate.skill.js.map