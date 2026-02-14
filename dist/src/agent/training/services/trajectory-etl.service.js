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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var TrajectoryETLService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrajectoryETLService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const data_quality_checker_service_1 = require("./data-quality-checker.service");
const pii_anonymizer_service_1 = require("./pii-anonymizer.service");
const dataset_version_manager_service_1 = require("./dataset-version-manager.service");
const crypto_1 = require("crypto");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
let TrajectoryETLService = TrajectoryETLService_1 = class TrajectoryETLService {
    constructor(prisma, qualityChecker, piiAnonymizer, versionManager) {
        this.prisma = prisma;
        this.qualityChecker = qualityChecker;
        this.piiAnonymizer = piiAnonymizer;
        this.versionManager = versionManager;
        this.logger = new common_1.Logger(TrajectoryETLService_1.name);
    }
    async extractTrajectories(options = {}) {
        this.logger.log(`[TrajectoryETL] 开始抽取轨迹数据: options=${JSON.stringify(options)}`);
        const where = {};
        if (options.trajectory_ids && options.trajectory_ids.length > 0) {
            where.trajectoryId = { in: options.trajectory_ids };
        }
        if (options.request_ids && options.request_ids.length > 0) {
            where.requestId = { in: options.request_ids };
        }
        if (options.min_validation_score !== undefined) {
            where.validationScore = { gte: options.min_validation_score };
        }
        if (options.min_total_reward !== undefined) {
            where.totalReward = { gte: options.min_total_reward };
        }
        if (options.model_version) {
            where.modelVersion = options.model_version;
        }
        if (options.country_code) {
            where.countryCode = options.country_code;
        }
        if (options.date_range) {
            where.createdAt = {
                gte: new Date(options.date_range.start),
                lte: new Date(options.date_range.end),
            };
        }
        where.validationStatus = 'VALIDATED';
        const trajectories = await this.prisma.validatedTrajectory.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: options.limit || 1000,
            skip: options.offset || 0,
        });
        this.logger.log(`[TrajectoryETL] 找到 ${trajectories.length} 条轨迹`);
        const rlTrajectories = [];
        for (const trajectory of trajectories) {
            try {
                const rlTrajectory = await this.transformToRLFormat(trajectory);
                const qualityResult = await this.qualityChecker.validateTrajectory(rlTrajectory);
                if (qualityResult.isValid) {
                    rlTrajectories.push(rlTrajectory);
                }
                else {
                    this.logger.warn(`[TrajectoryETL] 轨迹质量检查未通过: trajectoryId=${rlTrajectory.trajectory_id}, score=${qualityResult.score.toFixed(2)}, issues=${qualityResult.issues.length}`);
                }
            }
            catch (error) {
                this.logger.warn(`[TrajectoryETL] 转换轨迹失败: trajectoryId=${trajectory.trajectoryId}, error=${error === null || error === void 0 ? void 0 : error.message}`);
            }
        }
        this.logger.log(`[TrajectoryETL] 成功转换 ${rlTrajectories.length} 条轨迹`);
        return rlTrajectories;
    }
    async transformToRLFormat(trajectory) {
        var _a, _b, _c, _d, _e, _f;
        const plan = trajectory.plan;
        const decisionTrace = (trajectory.decisionTrace || []);
        const researchData = (trajectory.researchData || {});
        const gateResult = trajectory.gateResult;
        const complianceResult = trajectory.complianceResult;
        const rewardSignals = (trajectory.rewardSignals || []);
        const initialState = {
            request_id: trajectory.requestId,
            trip_id: trajectory.tripId || undefined,
            user_request: this.extractUserRequest(trajectory),
            research_data: researchData,
            gate_result: gateResult || undefined,
            compliance_result: complianceResult || undefined,
            current_itinerary: plan || undefined,
            decision_history: [],
            metadata: {
                country_code: trajectory.countryCode || undefined,
                model_version: trajectory.modelVersion || undefined,
                timestamp: trajectory.createdAt.toISOString(),
            },
        };
        const steps = [];
        if (plan) {
            steps.push({
                step_index: 0,
                state: initialState,
                action: {
                    action_type: 'PLAN_GENERATE',
                    action_params: {
                        plan: plan,
                    },
                    reasoning: this.extractReasoning(decisionTrace, 'PLAN_GENERATE'),
                    decision_point: 'plan_generation',
                    actor: this.extractActor(decisionTrace, 'PLAN_GENERATE'),
                },
                reward: {
                    total_reward: trajectory.totalReward || 0,
                    reward_signals: rewardSignals,
                    validation_score: trajectory.validationScore || undefined,
                    user_approval: trajectory.userApproval || undefined,
                    execution_success: ((_a = trajectory.executionResult) === null || _a === void 0 ? void 0 : _a.success) || undefined,
                },
                next_state: {
                    ...initialState,
                    current_itinerary: plan,
                    decision_history: decisionTrace,
                },
                timestamp: trajectory.createdAt.toISOString(),
            });
        }
        if (decisionTrace && decisionTrace.length > 0) {
            for (let i = 0; i < decisionTrace.length; i++) {
                const decision = decisionTrace[i];
                const prevStep = steps[steps.length - 1];
                const prevState = (prevStep === null || prevStep === void 0 ? void 0 : prevStep.next_state) || initialState;
                const decisionPoint = ((_b = decision.metadata) === null || _b === void 0 ? void 0 : _b.decisionPoint) || decision.step || 'plan_generation';
                const userChoice = (_c = decision.metadata) === null || _c === void 0 ? void 0 : _c.userChoice;
                const options = (_d = decision.metadata) === null || _d === void 0 ? void 0 : _d.options;
                const scores = (_e = decision.metadata) === null || _e === void 0 ? void 0 : _e.scores;
                const reasons = (_f = decision.metadata) === null || _f === void 0 ? void 0 : _f.reasons;
                const action = {
                    action_type: this.mapDecisionPointToActionType(decisionPoint),
                    action_params: {
                        decision_point: decisionPoint,
                        selected_option: userChoice || (options === null || options === void 0 ? void 0 : options[0]),
                        options: options,
                    },
                    reasoning: decision.outputs_summary,
                    decision_point: decisionPoint,
                    actor: decision.actor,
                    alternatives_considered: options === null || options === void 0 ? void 0 : options.map((opt, idx) => ({
                        option: opt,
                        score: scores === null || scores === void 0 ? void 0 : scores[idx],
                        reason: reasons === null || reasons === void 0 ? void 0 : reasons[idx],
                    })),
                };
                const nextState = {
                    ...prevState,
                    decision_history: [...(prevState.decision_history || []), decision],
                };
                const reward = {
                    total_reward: i === decisionTrace.length - 1 ? (trajectory.totalReward || 0) : 0,
                    reward_signals: i === decisionTrace.length - 1 ? rewardSignals : [],
                    validation_score: i === decisionTrace.length - 1 ? trajectory.validationScore : undefined,
                };
                steps.push({
                    step_index: steps.length,
                    state: prevState,
                    action,
                    reward,
                    next_state: nextState,
                    timestamp: decision.timestamp || trajectory.createdAt.toISOString(),
                });
            }
        }
        const rlTrajectory = {
            trajectory_id: trajectory.trajectoryId,
            request_id: trajectory.requestId,
            trip_id: trajectory.tripId || undefined,
            steps,
            metadata: {
                model_version: trajectory.modelVersion || 'v1.0',
                country_code: trajectory.countryCode || undefined,
                created_at: trajectory.createdAt.toISOString(),
                updated_at: trajectory.updatedAt.toISOString(),
                validation_status: trajectory.validationStatus,
                validation_score: trajectory.validationScore || undefined,
                total_reward: trajectory.totalReward || 0,
            },
        };
        return rlTrajectory;
    }
    async exportTrajectories(trajectories, format = 'jsonl', outputDir = './data/training') {
        this.logger.log(`[TrajectoryETL] 导出轨迹数据集: count=${trajectories.length}, format=${format}`);
        await fs.mkdir(outputDir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileExtension = format === 'parquet' ? 'parquet' : format === 'jsonl' ? 'jsonl' : 'json';
        const fileName = `trajectories_${timestamp}.${fileExtension}`;
        const filePath = path.join(outputDir, fileName);
        let fileSizeBytes = 0;
        if (format === 'jsonl') {
            const lines = trajectories.map((t) => JSON.stringify(t));
            const content = lines.join('\n');
            await fs.writeFile(filePath, content, 'utf-8');
            fileSizeBytes = Buffer.byteLength(content, 'utf-8');
        }
        else if (format === 'json') {
            const content = JSON.stringify(trajectories, null, 2);
            await fs.writeFile(filePath, content, 'utf-8');
            fileSizeBytes = Buffer.byteLength(content, 'utf-8');
        }
        else if (format === 'parquet') {
            throw new Error('Parquet export requires parquetjs library. Please install: npm install parquetjs');
        }
        const totalSteps = trajectories.reduce((sum, t) => sum + t.steps.length, 0);
        const avgReward = trajectories.reduce((sum, t) => sum + (t.metadata.total_reward || 0), 0) /
            trajectories.length;
        const avgValidationScore = trajectories
            .filter((t) => t.metadata.validation_score !== undefined)
            .reduce((sum, t) => sum + (t.metadata.validation_score || 0), 0) / trajectories.filter((t) => t.metadata.validation_score !== undefined).length || 0;
        const result = {
            format,
            file_path: filePath,
            record_count: trajectories.length,
            file_size_bytes: fileSizeBytes,
            metadata: {
                exported_at: new Date().toISOString(),
                trajectory_ids: trajectories.map((t) => t.trajectory_id),
                stats: {
                    total_steps: totalSteps,
                    avg_reward: avgReward,
                    avg_validation_score: avgValidationScore,
                },
            },
        };
        this.logger.log(`[TrajectoryETL] 导出完成: filePath=${filePath}, recordCount=${result.record_count}, fileSize=${(fileSizeBytes / 1024 / 1024).toFixed(2)}MB`);
        return result;
    }
    async loadToDataset(options = {}, format = 'jsonl', outputDir = './data/training', anonymizePII = true, piiConfig, createVersion = true) {
        this.logger.log(`[TrajectoryETL] 加载到训练数据集: options=${JSON.stringify(options)}`);
        const trajectories = await this.extractTrajectories(options);
        if (trajectories.length === 0) {
            throw new Error('No trajectories found matching the criteria');
        }
        const qualityResult = await this.qualityChecker.validateDataset(trajectories);
        this.logger.log(`[TrajectoryETL] 数据集质量检查: score=${qualityResult.score.toFixed(2)}, valid=${qualityResult.stats.valid_trajectories}/${qualityResult.stats.total_trajectories}`);
        let finalTrajectories = trajectories;
        if (anonymizePII) {
            this.logger.log(`[TrajectoryETL] 开始PII脱敏: count=${trajectories.length}`);
            finalTrajectories = await Promise.all(trajectories.map((t) => this.piiAnonymizer.anonymizeTrajectory(t, piiConfig)));
            this.logger.log(`[TrajectoryETL] PII脱敏完成`);
        }
        const result = await this.exportTrajectories(finalTrajectories, format, outputDir);
        const qualityReportPath = path.join(outputDir, `quality_report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
        await fs.writeFile(qualityReportPath, JSON.stringify(qualityResult, null, 2), 'utf-8');
        this.logger.log(`[TrajectoryETL] 质量报告已生成: ${qualityReportPath}`);
        let version;
        if (createVersion) {
            try {
                const datasetVersion = await this.versionManager.createDatasetVersion(result, qualityResult, {
                    date_range: options.date_range,
                    filter_criteria: {
                        min_validation_score: options.min_validation_score,
                        min_total_reward: options.min_total_reward,
                        model_version: options.model_version,
                        country_code: options.country_code,
                        trajectory_ids: options.trajectory_ids,
                        request_ids: options.request_ids,
                    },
                    total_trajectories: finalTrajectories.length,
                }, anonymizePII
                    ? {
                        enabled: true,
                        config_hash: piiConfig
                            ? (0, crypto_1.createHash)('sha256')
                                .update(JSON.stringify(piiConfig))
                                .digest('hex')
                                .substring(0, 16)
                            : undefined,
                    }
                    : undefined);
                version = datasetVersion.version;
                this.logger.log(`[TrajectoryETL] 数据集版本已创建: version=${version}`);
            }
            catch (error) {
                this.logger.warn(`[TrajectoryETL] 创建数据集版本失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
        }
        return {
            ...result,
            version,
        };
    }
    extractUserRequest(trajectory) {
        const decisionTrace = trajectory.decisionTrace || [];
        if (decisionTrace.length > 0 && decisionTrace[0].inputs_summary) {
            return decisionTrace[0].inputs_summary;
        }
        return `Plan trip for request: ${trajectory.requestId}`;
    }
    extractReasoning(decisionTrace, actionType) {
        const relevantDecision = decisionTrace.find((d) => {
            var _a;
            const decisionPoint = ((_a = d.metadata) === null || _a === void 0 ? void 0 : _a.decisionPoint) || d.step || 'plan_generation';
            return this.mapDecisionPointToActionType(decisionPoint) === actionType;
        });
        return relevantDecision === null || relevantDecision === void 0 ? void 0 : relevantDecision.outputs_summary;
    }
    extractActor(decisionTrace, actionType) {
        const relevantDecision = decisionTrace.find((d) => {
            var _a;
            const decisionPoint = ((_a = d.metadata) === null || _a === void 0 ? void 0 : _a.decisionPoint) || d.step || 'plan_generation';
            return this.mapDecisionPointToActionType(decisionPoint) === actionType;
        });
        return relevantDecision === null || relevantDecision === void 0 ? void 0 : relevantDecision.actor;
    }
    mapDecisionPointToActionType(decisionPoint) {
        const mapping = {
            plan_generation: 'PLAN_GENERATE',
            route_optimization: 'ROUTE_ADJUST',
            pace_adjustment: 'PACE_ADJUST',
            budget_estimation: 'BUDGET_ADJUST',
            transport_selection: 'TRANSPORT_SELECT',
            poi_selection: 'POI_SELECT',
            gate_check: 'GATE_CHECK',
            compliance_check: 'COMPLIANCE_CHECK',
            user_clarification: 'USER_CLARIFICATION',
        };
        return mapping[decisionPoint.toLowerCase()] || 'PLAN_GENERATE';
    }
};
exports.TrajectoryETLService = TrajectoryETLService;
exports.TrajectoryETLService = TrajectoryETLService = TrajectoryETLService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        data_quality_checker_service_1.DataQualityCheckerService,
        pii_anonymizer_service_1.PIIAnonymizerService,
        dataset_version_manager_service_1.DatasetVersionManagerService])
], TrajectoryETLService);
//# sourceMappingURL=trajectory-etl.service.js.map