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
var ContextCompilePackageSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextCompilePackageSkill = void 0;
const common_1 = require("@nestjs/common");
const context_build_skill_1 = require("./context-build.skill");
const context_compress_skill_1 = require("./context-compress.skill");
const context_evaluate_skill_1 = require("./context-evaluate.skill");
const tools_select_skill_1 = require("./tools-select.skill");
const plan_select_slices_skill_1 = require("./plan-select-slices.skill");
let ContextCompilePackageSkill = ContextCompilePackageSkill_1 = class ContextCompilePackageSkill {
    constructor(contextBuild, contextCompress, contextEvaluate, toolsSelect, planSelectSlices) {
        this.contextBuild = contextBuild;
        this.contextCompress = contextCompress;
        this.contextEvaluate = contextEvaluate;
        this.toolsSelect = toolsSelect;
        this.planSelectSlices = planSelectSlices;
        this.logger = new common_1.Logger(ContextCompilePackageSkill_1.name);
        this.metadata = {
            name: 'context.compilePackage',
            description: 'Context 编译统一入口：整合 context-build/compress/evaluate/tools-select，输出 public_context / private_context_ref / tool_allowlist',
            version: '1.0.0',
            category: 'rag',
        };
        if (!this.contextBuild) {
            this.logger.warn('ContextBuildSkill 未注入，context.compilePackage 功能将受限');
        }
        if (!this.toolsSelect) {
            this.logger.warn('ToolsSelectSkill 未注入，工具选择功能将不可用');
        }
    }
    async execute(input) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        const startTime = Date.now();
        this.logger.debug(`执行 context.compilePackage: userQuery=${input.inputContext.userQuery.substring(0, 50)}...`);
        try {
            if (!this.contextBuild) {
                throw new Error('ContextBuildSkill 未注入，无法构建上下文');
            }
            const buildInput = {
                tripId: (_a = input.inputContext.currentState) === null || _a === void 0 ? void 0 : _a.tripId,
                phase: input.inputContext.planningPhase || ((_b = input.inputContext.currentState) === null || _b === void 0 ? void 0 : _b.phase) || 'planning',
                agent: ((_c = input.inputContext.currentState) === null || _c === void 0 ? void 0 : _c.agent) || 'planner',
                userQuery: input.inputContext.userQuery,
                tokenBudget: ((_d = input.options) === null || _d === void 0 ? void 0 : _d.tokenBudget) || ((_e = input.options) === null || _e === void 0 ? void 0 : _e.maxTokens) || 3600,
                includePrivate: ((_f = input.options) === null || _f === void 0 ? void 0 : _f.includePrivate) || false,
                requiredTopics: input.inputContext.constraints,
            };
            const buildResult = await this.contextBuild.execute(buildInput);
            const contextPackage = buildResult.contextPackage;
            const originalTokenCount = this.estimateTokenCount(contextPackage);
            let compressedPackage = contextPackage;
            let compressedTokenCount;
            let compressionRatio;
            if (((_g = input.options) === null || _g === void 0 ? void 0 : _g.enableCompression) && this.contextCompress) {
                try {
                    const targetTokenCount = input.options.maxTokens || input.options.targetCompressionRatio
                        ? Math.floor(originalTokenCount * (input.options.targetCompressionRatio || 0.7))
                        : originalTokenCount * 0.7;
                    const compressInput = {
                        blocks: contextPackage.blocks,
                        tokenBudget: targetTokenCount,
                        strategy: 'balanced',
                    };
                    const compressResult = await this.contextCompress.execute(compressInput);
                    compressedPackage = {
                        ...contextPackage,
                        blocks: compressResult.compressedBlocks,
                    };
                    compressedTokenCount = this.estimateTokenCount(compressedPackage);
                    compressionRatio = compressedTokenCount / originalTokenCount;
                }
                catch (error) {
                    this.logger.warn(`上下文压缩失败: ${error.message}，使用原始上下文`);
                }
            }
            let evaluationScore;
            if (((_h = input.options) === null || _h === void 0 ? void 0 : _h.enableEvaluation) && this.contextEvaluate) {
                try {
                    const evaluateInput = {
                        contextPackage: compressedPackage,
                        userQuery: input.inputContext.userQuery,
                        phase: input.inputContext.planningPhase || ((_j = input.inputContext.currentState) === null || _j === void 0 ? void 0 : _j.phase),
                    };
                    const evaluateResult = await this.contextEvaluate.execute(evaluateInput);
                    const qualityScore = {
                        EXCELLENT: 90,
                        GOOD: 70,
                        FAIR: 50,
                        POOR: 30,
                    };
                    evaluationScore = qualityScore[evaluateResult.summary.quality] || evaluateResult.metrics.relevanceScore || 50;
                }
                catch (error) {
                    this.logger.warn(`上下文评估失败: ${error.message}`);
                }
            }
            const enableToolSelection = ((_k = input.options) === null || _k === void 0 ? void 0 : _k.enableToolSelection) !== false;
            let toolAllowlist = [];
            if (enableToolSelection && this.toolsSelect) {
                try {
                    const toolsSelectInput = {
                        userQuery: input.inputContext.userQuery,
                        planningPhase: input.inputContext.planningPhase || ((_l = input.inputContext.currentState) === null || _l === void 0 ? void 0 : _l.phase) || 'planning',
                        currentState: input.inputContext.currentState,
                    };
                    const toolsSelectResult = await this.toolsSelect.execute(toolsSelectInput);
                    toolAllowlist = toolsSelectResult.tools.map((tool) => ({
                        toolName: `tripnara.${tool.name}`,
                        reason: tool.reason,
                        confidence: tool.priority / 100,
                        priority: tool.priority,
                    }));
                }
                catch (error) {
                    this.logger.warn(`工具选择失败: ${error.message}`);
                }
            }
            const publicContext = this.extractPublicContext(compressedPackage);
            const contextId = `ctx-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            const accessToken = this.generateAccessToken(contextId);
            const privateContextRef = {
                contextId,
                accessToken,
            };
            const compilationTime = Date.now() - startTime;
            return {
                publicContext: {
                    summary: publicContext.summary,
                    keyFacts: publicContext.keyFacts,
                    toolAllowlist: toolAllowlist.map((t) => t.toolName),
                },
                privateContextRef,
                toolAllowlist,
                metadata: {
                    originalTokenCount,
                    compressedTokenCount,
                    compressionRatio,
                    evaluationScore,
                    compilationTime,
                },
                contextPackage: compressedPackage,
            };
        }
        catch (error) {
            this.logger.error(`Context 编译失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    estimateTokenCount(contextPackage) {
        let totalChars = 0;
        for (const block of contextPackage.blocks) {
            totalChars += JSON.stringify(block).length;
        }
        return Math.ceil(totalChars / 4);
    }
    extractPublicContext(contextPackage) {
        const summary = `Context Package with ${contextPackage.blocks.length} blocks, total priority: ${contextPackage.blocks.reduce((sum, b) => sum + (b.priority || 0), 0)}`;
        const keyFacts = [];
        const sortedBlocks = [...contextPackage.blocks].sort((a, b) => (b.priority || 0) - (a.priority || 0));
        for (const block of sortedBlocks.slice(0, 5)) {
            if (block.text) {
                const fact = block.text.substring(0, 100);
                keyFacts.push(fact);
            }
        }
        return { summary, keyFacts };
    }
    generateAccessToken(contextId) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        const tokenData = `${contextId}:${timestamp}:${random}`;
        const accessToken = Buffer.from(tokenData).toString('base64');
        this.logger.debug(`生成访问令牌: contextId=${contextId}, token=${accessToken.substring(0, 20)}...`);
        return accessToken;
    }
};
exports.ContextCompilePackageSkill = ContextCompilePackageSkill;
exports.ContextCompilePackageSkill = ContextCompilePackageSkill = ContextCompilePackageSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [context_build_skill_1.ContextBuildSkill,
        context_compress_skill_1.ContextCompressSkill,
        context_evaluate_skill_1.ContextEvaluateSkill,
        tools_select_skill_1.ToolsSelectSkill,
        plan_select_slices_skill_1.PlanSelectSlicesSkill])
], ContextCompilePackageSkill);
//# sourceMappingURL=context-compile-package.skill.js.map