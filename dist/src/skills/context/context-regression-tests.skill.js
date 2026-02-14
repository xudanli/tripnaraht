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
var ContextRegressionTestsSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextRegressionTestsSkill = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
let ContextRegressionTestsSkill = ContextRegressionTestsSkill_1 = class ContextRegressionTestsSkill {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(ContextRegressionTestsSkill_1.name);
        this.metadata = {
            name: 'context.regressionTests',
            description: '上下文编译回归测试：生成快照 hash，比较两次构建的差异，检测回归',
            version: '1.0.0',
            category: 'rag',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 context.regressionTests: blocks=${input.currentPackage.blocks.length}, tokens=${input.currentPackage.totalTokens}`);
        try {
            const snapshot = this.createSnapshot(input.currentPackage);
            const snapshotHash = this.generateHash(snapshot);
            let comparison;
            if (input.previousPackage || input.previousSnapshotHash) {
                let previousSnapshot;
                if (input.previousPackage) {
                    previousSnapshot = this.createSnapshot(input.previousPackage);
                }
                else if (input.previousSnapshotHash && this.prisma) {
                    this.logger.warn('从 previousSnapshotHash 加载快照的功能待实现');
                }
                if (previousSnapshot) {
                    comparison = this.compareSnapshots(previousSnapshot, snapshot, input.tolerance || {
                        blockCountChange: 0.2,
                        tokenCountChange: 0.3,
                        priorityChange: 5,
                    });
                }
            }
            return {
                snapshotHash,
                snapshot,
                comparison,
            };
        }
        catch (error) {
            this.logger.error(`上下文回归测试失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    createSnapshot(contextPackage) {
        const blocks = contextPackage.blocks;
        const blockKeys = blocks.map((b) => b.key).sort();
        const blockTypeDistribution = {};
        for (const block of blocks) {
            blockTypeDistribution[block.type] = (blockTypeDistribution[block.type] || 0) + 1;
        }
        const priorityDistribution = {
            high: blocks.filter((b) => b.priority >= 80).length,
            medium: blocks.filter((b) => b.priority >= 50 && b.priority < 80).length,
            low: blocks.filter((b) => b.priority < 50).length,
        };
        const sourceDistribution = {};
        for (const block of blocks) {
            const source = block.provenance.source;
            sourceDistribution[source] = (sourceDistribution[source] || 0) + 1;
        }
        return {
            timestamp: new Date().toISOString(),
            blockCount: blocks.length,
            totalTokens: contextPackage.totalTokens,
            blockKeys,
            blockTypeDistribution,
            priorityDistribution,
            sourceDistribution,
        };
    }
    generateHash(snapshot) {
        const content = JSON.stringify({
            blockKeys: snapshot.blockKeys,
            blockCount: snapshot.blockCount,
            totalTokens: snapshot.totalTokens,
            blockTypeDistribution: snapshot.blockTypeDistribution,
        });
        return (0, crypto_1.createHash)('sha256').update(content).digest('hex').substring(0, 16);
    }
    compareSnapshots(previous, current, tolerance) {
        const hasChanges = JSON.stringify(previous) !== JSON.stringify(current);
        const blockCountChange = (current.blockCount - previous.blockCount) / previous.blockCount;
        const blockCountChangeAbs = Math.abs(blockCountChange);
        const tokenCountChange = (current.totalTokens - previous.totalTokens) / previous.totalTokens;
        const tokenCountChangeAbs = Math.abs(tokenCountChange);
        const previousKeysSet = new Set(previous.blockKeys);
        const currentKeysSet = new Set(current.blockKeys);
        const addedBlocks = current.blockKeys.filter((key) => !previousKeysSet.has(key));
        const removedBlocks = previous.blockKeys.filter((key) => !currentKeysSet.has(key));
        const changedBlocks = [];
        const regressions = [];
        let hasRegression = false;
        if (blockCountChangeAbs > (tolerance.blockCountChange || 0.2)) {
            if (blockCountChange < 0) {
                regressions.push(`块数量减少过多: ${(blockCountChange * 100).toFixed(1)}%`);
                hasRegression = true;
            }
            else {
                regressions.push(`块数量增加过多: ${(blockCountChange * 100).toFixed(1)}%`);
            }
        }
        if (tokenCountChangeAbs > (tolerance.tokenCountChange || 0.3)) {
            if (tokenCountChange < 0) {
                regressions.push(`Token 数量减少过多: ${(tokenCountChange * 100).toFixed(1)}%`);
                hasRegression = true;
            }
            else {
                regressions.push(`Token 数量增加过多: ${(tokenCountChange * 100).toFixed(1)}%`);
            }
        }
        const importantBlockTypes = ['ABU_RULES', 'COUNTRY_SAFETY', 'COUNTRY_ROAD_RULES', 'DECISION_LOG'];
        for (const removedKey of removedBlocks) {
            if (importantBlockTypes.some((type) => removedKey.includes(type))) {
                regressions.push(`重要块被删除: ${removedKey}`);
                hasRegression = true;
            }
        }
        const previousTypeSum = Object.values(previous.blockTypeDistribution).reduce((a, b) => a + b, 0);
        const currentTypeSum = Object.values(current.blockTypeDistribution).reduce((a, b) => a + b, 0);
        if (previousTypeSum > 0 && currentTypeSum > 0) {
            for (const [type, previousCount] of Object.entries(previous.blockTypeDistribution)) {
                const currentCount = current.blockTypeDistribution[type] || 0;
                const previousRatio = previousCount / previousTypeSum;
                const currentRatio = currentCount / currentTypeSum;
                if (Math.abs(currentRatio - previousRatio) > 0.2) {
                    regressions.push(`块类型分布发生重大变化: ${type} (${(previousRatio * 100).toFixed(1)}% -> ${(currentRatio * 100).toFixed(1)}%)`);
                }
            }
        }
        return {
            hasChanges,
            hasRegression,
            blockCountChange,
            tokenCountChange,
            addedBlocks,
            removedBlocks,
            changedBlocks,
            regressions,
        };
    }
};
exports.ContextRegressionTestsSkill = ContextRegressionTestsSkill;
exports.ContextRegressionTestsSkill = ContextRegressionTestsSkill = ContextRegressionTestsSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('PrismaService')),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [Object])
], ContextRegressionTestsSkill);
//# sourceMappingURL=context-regression-tests.skill.js.map