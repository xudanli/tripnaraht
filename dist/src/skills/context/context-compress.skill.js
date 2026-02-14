"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ContextCompressSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextCompressSkill = void 0;
const common_1 = require("@nestjs/common");
let ContextCompressSkill = ContextCompressSkill_1 = class ContextCompressSkill {
    constructor() {
        this.logger = new common_1.Logger(ContextCompressSkill_1.name);
        this.metadata = {
            name: 'context.compress',
            description: '上下文压缩：按预算压缩 blocks（递归摘要/剪枝），保留硬门槛、关键决策点、失败尝试',
            version: '1.0.0',
            category: 'rag',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 context.compress: blocks=${input.blocks.length}, budget=${input.tokenBudget}`);
        try {
            const strategy = input.strategy || 'balanced';
            const preserveKeys = input.preserveKeys || [];
            const originalTokens = this.estimateTokens(input.blocks);
            if (originalTokens <= input.tokenBudget) {
                return {
                    compressedBlocks: input.blocks,
                    stats: {
                        originalBlocks: input.blocks.length,
                        compressedBlocks: input.blocks.length,
                        originalTokens,
                        compressedTokens: originalTokens,
                        reductionRatio: 0,
                        removedKeys: [],
                    },
                };
            }
            const categorized = this.categorizeBlocks(input.blocks);
            let compressed;
            const removedKeys = [];
            switch (strategy) {
                case 'aggressive':
                    compressed = this.compressAggressive(categorized, input.tokenBudget, preserveKeys, removedKeys);
                    break;
                case 'conservative':
                    compressed = this.compressConservative(categorized, input.tokenBudget, preserveKeys, removedKeys);
                    break;
                default:
                    compressed = this.compressBalanced(categorized, input.tokenBudget, preserveKeys, removedKeys);
            }
            const compressedTokens = this.estimateTokens(compressed);
            const reductionRatio = 1 - compressedTokens / originalTokens;
            return {
                compressedBlocks: compressed,
                stats: {
                    originalBlocks: input.blocks.length,
                    compressedBlocks: compressed.length,
                    originalTokens,
                    compressedTokens,
                    reductionRatio,
                    removedKeys,
                },
            };
        }
        catch (error) {
            this.logger.error(`上下文压缩失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    categorizeBlocks(blocks) {
        const hardThresholds = [];
        const keyDecisions = [];
        const failures = [];
        const others = [];
        for (const block of blocks) {
            if (block.type === 'ABU_RULES' ||
                block.type === 'COUNTRY_ROAD_RULES' ||
                block.type === 'COUNTRY_SAFETY' ||
                block.type === 'REJECTION_LOG') {
                hardThresholds.push(block);
            }
            else if (block.type === 'DECISION_LOG' ||
                block.type === 'PLAN_SUMMARY') {
                keyDecisions.push(block);
            }
            else if (block.text.toLowerCase().includes('fail') || block.text.toLowerCase().includes('拒绝')) {
                failures.push(block);
            }
            else {
                others.push(block);
            }
        }
        return { hardThresholds, keyDecisions, failures, others };
    }
    compressAggressive(categorized, tokenBudget, preserveKeys, removedKeys) {
        const compressed = [];
        for (const block of categorized.hardThresholds) {
            if (this.willFit(compressed, block, tokenBudget) || preserveKeys.includes(block.key)) {
                compressed.push(this.summarizeBlock(block, 'short'));
            }
            else {
                removedKeys.push(block.key);
            }
        }
        for (const block of categorized.keyDecisions) {
            if (this.willFit(compressed, block, tokenBudget) || preserveKeys.includes(block.key)) {
                compressed.push(this.summarizeBlock(block, 'medium'));
            }
            else {
                removedKeys.push(block.key);
            }
        }
        for (const block of categorized.failures) {
            if (this.willFit(compressed, block, tokenBudget) || preserveKeys.includes(block.key)) {
                compressed.push(this.summarizeBlock(block, 'short'));
            }
            else {
                removedKeys.push(block.key);
            }
        }
        for (const block of categorized.others) {
            if (!preserveKeys.includes(block.key)) {
                removedKeys.push(block.key);
            }
            else {
                compressed.push(this.summarizeBlock(block, 'short'));
            }
        }
        return compressed;
    }
    compressConservative(categorized, tokenBudget, preserveKeys, removedKeys) {
        const compressed = [];
        const allBlocks = [
            ...categorized.hardThresholds,
            ...categorized.keyDecisions,
            ...categorized.failures,
            ...categorized.others,
        ];
        allBlocks.sort((a, b) => b.priority - a.priority);
        for (const block of allBlocks) {
            const summarized = this.summarizeBlock(block, 'medium');
            if (this.willFit(compressed, summarized, tokenBudget) || preserveKeys.includes(block.key)) {
                compressed.push(summarized);
            }
            else {
                removedKeys.push(block.key);
            }
        }
        return compressed;
    }
    compressBalanced(categorized, tokenBudget, preserveKeys, removedKeys) {
        const compressed = [];
        for (const block of categorized.hardThresholds) {
            if (this.willFit(compressed, block, tokenBudget) || preserveKeys.includes(block.key)) {
                compressed.push(block);
            }
            else {
                compressed.push(this.summarizeBlock(block, 'short'));
            }
        }
        for (const block of categorized.keyDecisions) {
            if (this.willFit(compressed, block, tokenBudget) || preserveKeys.includes(block.key)) {
                compressed.push(this.summarizeBlock(block, 'medium'));
            }
            else {
                removedKeys.push(block.key);
            }
        }
        for (const block of categorized.failures) {
            if (this.willFit(compressed, block, tokenBudget) || preserveKeys.includes(block.key)) {
                compressed.push(this.summarizeBlock(block, 'short'));
            }
            else {
                removedKeys.push(block.key);
            }
        }
        categorized.others.sort((a, b) => b.priority - a.priority);
        for (const block of categorized.others) {
            if (preserveKeys.includes(block.key)) {
                compressed.push(this.summarizeBlock(block, 'short'));
            }
            else if (block.priority >= 50 && this.willFit(compressed, block, tokenBudget)) {
                compressed.push(this.summarizeBlock(block, 'short'));
            }
            else {
                removedKeys.push(block.key);
            }
        }
        return compressed;
    }
    summarizeBlock(block, level) {
        const maxLength = { short: 100, medium: 200, long: 500 }[level];
        if (block.text.length <= maxLength) {
            return block;
        }
        const truncated = block.text.substring(0, maxLength - 50);
        const keyInfo = this.extractKeyInfo(block);
        const summarized = `${truncated}...\n[关键信息] ${keyInfo}`;
        return {
            ...block,
            text: summarized,
            estimatedTokens: Math.ceil(summarized.length / 4),
        };
    }
    extractKeyInfo(block) {
        if (block.data) {
            const keys = Object.keys(block.data).slice(0, 3);
            return keys.map((key) => `${key}: ${JSON.stringify(block.data[key]).substring(0, 30)}`).join(', ');
        }
        return block.text.split('\n').slice(0, 2).join('; ');
    }
    estimateTokens(blocks) {
        let totalChars = 0;
        for (const block of blocks) {
            totalChars += block.text.length;
            if (block.data) {
                totalChars += JSON.stringify(block.data).length;
            }
        }
        return Math.ceil((totalChars * 0.7) / 1.5 + (totalChars * 0.3) / 4);
    }
    willFit(blocks, newBlock, tokenBudget) {
        const currentTokens = this.estimateTokens(blocks);
        const newBlockTokens = newBlock.estimatedTokens || this.estimateTokens([newBlock]);
        return currentTokens + newBlockTokens <= tokenBudget;
    }
};
exports.ContextCompressSkill = ContextCompressSkill;
exports.ContextCompressSkill = ContextCompressSkill = ContextCompressSkill_1 = __decorate([
    (0, common_1.Injectable)()
], ContextCompressSkill);
//# sourceMappingURL=context-compress.skill.js.map