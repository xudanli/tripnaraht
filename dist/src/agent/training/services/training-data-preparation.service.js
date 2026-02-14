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
var TrainingDataPreparationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrainingDataPreparationService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
let TrainingDataPreparationService = TrainingDataPreparationService_1 = class TrainingDataPreparationService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(TrainingDataPreparationService_1.name);
    }
    async prepareTrainingBatch(options = {}) {
        const { minScore = 0.8, minReward = 0, maxUsageCount = 3, batchSize = 1000, modelVersion, countryCode, } = options;
        this.logger.log(`[TrainingDataPrep] 准备训练批次: minScore=${minScore}, minReward=${minReward}, maxUsageCount=${maxUsageCount}, batchSize=${batchSize}`);
        const where = {
            validationStatus: 'VALIDATED',
            validationScore: { gte: minScore },
            totalReward: { gt: minReward },
            usedForTrainingCount: { lt: maxUsageCount },
        };
        if (modelVersion) {
            where.modelVersion = modelVersion;
        }
        if (countryCode) {
            where.countryCode = countryCode;
        }
        const trajectories = await this.prisma.validatedTrajectory.findMany({
            where,
            orderBy: [
                { totalReward: 'desc' },
                { validationScore: 'desc' },
                { createdAt: 'desc' },
            ],
            take: batchSize,
        });
        this.logger.log(`[TrainingDataPrep] 找到 ${trajectories.length} 条符合条件的轨迹`);
        const trainingData = trajectories.map((t) => this.convertToSFTFormat(t));
        const stats = {
            totalTrajectories: trajectories.length,
            avgScore: this.calculateAverage(trajectories.map((t) => t.validationScore)),
            avgReward: this.calculateAverage(trajectories.map((t) => t.totalReward)),
            minScore: Math.min(...trajectories.map((t) => t.validationScore)),
            maxScore: Math.max(...trajectories.map((t) => t.validationScore)),
            minReward: Math.min(...trajectories.map((t) => t.totalReward)),
            maxReward: Math.max(...trajectories.map((t) => t.totalReward)),
            modelVersions: [...new Set(trajectories.map((t) => t.modelVersion))],
            countryCodes: [
                ...new Set(trajectories.map((t) => t.countryCode).filter((c) => c !== null)),
            ],
        };
        return {
            batchId: `batch_${Date.now()}`,
            trajectories: trajectories.map((t) => ({
                trajectoryId: t.trajectoryId,
                requestId: t.requestId,
                tripId: t.tripId,
                validationScore: t.validationScore,
                totalReward: t.totalReward,
                modelVersion: t.modelVersion,
            })),
            trainingData,
            stats,
            createdAt: new Date(),
        };
    }
    async markAsUsed(trajectoryIds, batchId) {
        this.logger.log(`[TrainingDataPrep] 标记 ${trajectoryIds.length} 条轨迹为已使用: batchId=${batchId}`);
        await this.prisma.validatedTrajectory.updateMany({
            where: {
                trajectoryId: { in: trajectoryIds },
            },
            data: {
                usedForTraining: true,
                usedForTrainingCount: { increment: 1 },
                trainingBatchId: batchId,
            },
        });
        this.logger.log(`[TrainingDataPrep] 轨迹标记完成`);
    }
    async exportToJSONL(batch, outputPath) {
        this.logger.log(`[TrainingDataPrep] 导出训练数据为 JSONL: batchId=${batch.batchId}, outputPath=${outputPath}`);
        const dir = path.dirname(outputPath);
        await fs.mkdir(dir, { recursive: true });
        const lines = [];
        for (const example of batch.trainingData) {
            const sftExample = {
                messages: [
                    {
                        role: 'user',
                        content: this.formatUserInput(example.input),
                    },
                    {
                        role: 'assistant',
                        content: this.formatAssistantOutput(example.output),
                    },
                ],
                metadata: example.metadata,
            };
            lines.push(JSON.stringify(sftExample));
        }
        await fs.writeFile(outputPath, lines.join('\n') + '\n', 'utf-8');
        this.logger.log(`[TrainingDataPrep] JSONL 导出完成: ${lines.length} 条记录`);
        return {
            filePath: outputPath,
            lineCount: lines.length,
        };
    }
    async exportToJSON(batch, outputPath) {
        this.logger.log(`[TrainingDataPrep] 导出训练数据为 JSON: batchId=${batch.batchId}, outputPath=${outputPath}`);
        const dir = path.dirname(outputPath);
        await fs.mkdir(dir, { recursive: true });
        const jsonData = {
            batch_id: batch.batchId,
            created_at: batch.createdAt.toISOString(),
            stats: batch.stats,
            trajectories: batch.trajectories,
            training_data: batch.trainingData.map((example) => ({
                messages: [
                    {
                        role: 'user',
                        content: this.formatUserInput(example.input),
                    },
                    {
                        role: 'assistant',
                        content: this.formatAssistantOutput(example.output),
                    },
                ],
                metadata: example.metadata,
            })),
        };
        await fs.writeFile(outputPath, JSON.stringify(jsonData, null, 2), 'utf-8');
        this.logger.log(`[TrainingDataPrep] JSON 导出完成: ${batch.trainingData.length} 条记录`);
        return {
            filePath: outputPath,
            recordCount: batch.trainingData.length,
        };
    }
    formatUserInput(input) {
        var _a;
        const parts = [];
        parts.push(`用户请求: ${input.user_request}`);
        if (input.research_data && Object.keys(input.research_data).length > 0) {
            parts.push(`\n研究数据: ${JSON.stringify(input.research_data, null, 2)}`);
        }
        if (input.gate_result) {
            parts.push(`\nGate 结果: ${input.gate_result.gate_result} (置信度: ${input.gate_result.confidence || 'N/A'})`);
        }
        if (((_a = input.compliance_result) === null || _a === void 0 ? void 0 : _a.risk_warnings) &&
            input.compliance_result.risk_warnings.length > 0) {
            const warnings = input.compliance_result.risk_warnings
                .map((w) => `[${w.level}] ${w.message}`)
                .join('\n');
            parts.push(`\n合规警告:\n${warnings}`);
        }
        return parts.join('\n');
    }
    formatAssistantOutput(output) {
        const parts = [];
        if (output.reasoning) {
            parts.push(`推理过程:\n${output.reasoning}`);
        }
        parts.push(`\n生成的计划:\n${JSON.stringify(output.plan, null, 2)}`);
        if (output.decision_trace && Array.isArray(output.decision_trace)) {
            const traceSummary = output.decision_trace
                .map((entry) => `- [${entry.step}] ${entry.actor}: ${entry.outputs_summary || entry.inputs_summary}`)
                .join('\n');
            parts.push(`\n决策链:\n${traceSummary}`);
        }
        return parts.join('\n');
    }
    convertToSFTFormat(trajectory) {
        const userRequest = this.extractUserRequest(trajectory);
        const generatedPlan = trajectory.plan;
        const decisionTrace = trajectory.decisionTrace;
        return {
            input: {
                user_request: userRequest,
                research_data: trajectory.researchData,
                gate_result: trajectory.gateResult,
                compliance_result: trajectory.complianceResult,
            },
            output: {
                plan: generatedPlan,
                decision_trace: decisionTrace,
                reasoning: this.extractReasoning(decisionTrace),
            },
            metadata: {
                trajectory_id: trajectory.trajectoryId,
                request_id: trajectory.requestId,
                trip_id: trajectory.tripId,
                validation_score: trajectory.validationScore,
                total_reward: trajectory.totalReward,
                model_version: trajectory.modelVersion,
                timestamp: trajectory.timestamp.toISOString(),
            },
        };
    }
    extractUserRequest(trajectory) {
        const decisionTrace = trajectory.decisionTrace;
        if (Array.isArray(decisionTrace) && decisionTrace.length > 0) {
            const firstEntry = decisionTrace[0];
            if (firstEntry.inputs_summary) {
                return firstEntry.inputs_summary;
            }
        }
        return '用户规划请求';
    }
    extractReasoning(decisionTrace) {
        if (!Array.isArray(decisionTrace)) {
            return '';
        }
        return decisionTrace
            .map((entry) => {
            const parts = [];
            if (entry.step)
                parts.push(`步骤: ${entry.step}`);
            if (entry.actor)
                parts.push(`执行者: ${entry.actor}`);
            if (entry.inputs_summary)
                parts.push(`输入: ${entry.inputs_summary}`);
            if (entry.outputs_summary)
                parts.push(`输出: ${entry.outputs_summary}`);
            return parts.join('; ');
        })
            .join('\n');
    }
    calculateAverage(values) {
        if (values.length === 0)
            return 0;
        return values.reduce((sum, v) => sum + v, 0) / values.length;
    }
};
exports.TrainingDataPreparationService = TrainingDataPreparationService;
exports.TrainingDataPreparationService = TrainingDataPreparationService = TrainingDataPreparationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TrainingDataPreparationService);
//# sourceMappingURL=training-data-preparation.service.js.map