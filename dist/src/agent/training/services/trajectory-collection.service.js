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
var TrajectoryCollectionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrajectoryCollectionService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const trajectory_validator_service_1 = require("./trajectory-validator.service");
const reward_signal_extractor_service_1 = require("./reward-signal-extractor.service");
const roll_trajectory_adapter_service_1 = require("./roll-trajectory-adapter.service");
const user_feedback_service_1 = require("../../../skills/world/services/user-feedback.service");
const user_capability_learning_service_1 = require("../../../skills/world/services/user-capability-learning.service");
let TrajectoryCollectionService = TrajectoryCollectionService_1 = class TrajectoryCollectionService {
    constructor(prisma, validator, rewardExtractor, rollTrajectoryAdapter, userFeedbackService, userCapabilityLearningService) {
        this.prisma = prisma;
        this.validator = validator;
        this.rewardExtractor = rewardExtractor;
        this.rollTrajectoryAdapter = rollTrajectoryAdapter;
        this.userFeedbackService = userFeedbackService;
        this.userCapabilityLearningService = userCapabilityLearningService;
        this.logger = new common_1.Logger(TrajectoryCollectionService_1.name);
    }
    async collectTrajectory(data) {
        this.logger.debug(`[TrajectoryCollection] 收集轨迹: requestId=${data.requestId}`);
        try {
            const trajectoryId = `traj_${data.requestId}_${Date.now()}`;
            const validationResult = await this.validator.validateTrajectory(data.gateResult, data.complianceResult);
            const trajectory = await this.prisma.validatedTrajectory.create({
                data: {
                    trajectoryId,
                    requestId: data.requestId,
                    tripId: data.tripId,
                    validationStatus: validationResult.isValid ? 'VALIDATED' : 'REJECTED',
                    validationScore: validationResult.score,
                    validationReasons: validationResult.reasons,
                    plan: data.plan,
                    decisionTrace: data.decisionTrace,
                    researchData: data.researchData,
                    gateResult: data.gateResult,
                    complianceResult: data.complianceResult,
                    modelVersion: data.modelVersion || 'v1.0',
                    countryCode: data.countryCode,
                },
            });
            this.logger.log(`[TrajectoryCollection] 轨迹已收集: trajectoryId=${trajectoryId}, status=${trajectory.validationStatus}`);
            return {
                trajectoryId,
                status: trajectory.validationStatus,
            };
        }
        catch (error) {
            this.logger.error(`[TrajectoryCollection] 收集轨迹失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async updateTrajectoryWithApproval(trajectoryId, userApproval) {
        this.logger.debug(`[TrajectoryCollection] 更新轨迹审批状态: trajectoryId=${trajectoryId}, approval=${userApproval}`);
        try {
            const trajectory = await this.prisma.validatedTrajectory.findUnique({
                where: { trajectoryId },
            });
            if (!trajectory) {
                throw new Error(`轨迹不存在: ${trajectoryId}`);
            }
            const validationResult = await this.validator.validateTrajectory(trajectory.gateResult, trajectory.complianceResult, userApproval);
            const approvalRewardSignals = this.rewardExtractor.extractFromApproval(userApproval);
            const existingRewardSignals = trajectory.rewardSignals || [];
            const mergedRewardSignals = this.rewardExtractor.mergeSignals(existingRewardSignals, approvalRewardSignals);
            const totalReward = this.rewardExtractor.calculateTotalReward(mergedRewardSignals);
            await this.prisma.validatedTrajectory.update({
                where: { trajectoryId },
                data: {
                    userApproval,
                    validationStatus: validationResult.isValid ? 'VALIDATED' : 'REJECTED',
                    validationScore: validationResult.score,
                    validationReasons: validationResult.reasons,
                    rewardSignals: mergedRewardSignals,
                    totalReward,
                },
            });
            this.logger.log(`[TrajectoryCollection] 轨迹审批状态已更新: trajectoryId=${trajectoryId}`);
        }
        catch (error) {
            this.logger.error(`[TrajectoryCollection] 更新轨迹审批状态失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async updateTrajectoryWithExecution(trajectoryId, executionResult) {
        this.logger.debug(`[TrajectoryCollection] 更新轨迹执行结果: trajectoryId=${trajectoryId}, success=${executionResult.success}`);
        try {
            const trajectory = await this.prisma.validatedTrajectory.findUnique({
                where: { trajectoryId },
            });
            if (!trajectory) {
                throw new Error(`轨迹不存在: ${trajectoryId}`);
            }
            const userApproval = trajectory.userApproval
                ? trajectory.userApproval
                : undefined;
            const validationResult = await this.validator.validateTrajectory(trajectory.gateResult, trajectory.complianceResult, userApproval, executionResult);
            const executionRewardSignals = this.rewardExtractor.extractFromExecution(executionResult);
            const existingRewardSignals = trajectory.rewardSignals || [];
            const mergedRewardSignals = this.rewardExtractor.mergeSignals(existingRewardSignals, executionRewardSignals);
            const totalReward = this.rewardExtractor.calculateTotalReward(mergedRewardSignals);
            await this.prisma.validatedTrajectory.update({
                where: { trajectoryId },
                data: {
                    executionResult: executionResult,
                    validationStatus: validationResult.isValid ? 'VALIDATED' : 'REJECTED',
                    validationScore: validationResult.score,
                    validationReasons: validationResult.reasons,
                    rewardSignals: mergedRewardSignals,
                    totalReward,
                },
            });
            this.logger.log(`[TrajectoryCollection] 轨迹执行结果已更新: trajectoryId=${trajectoryId}`);
        }
        catch (error) {
            this.logger.error(`[TrajectoryCollection] 更新轨迹执行结果失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async findTrajectoryByRequestId(requestId) {
        const trajectory = await this.prisma.validatedTrajectory.findFirst({
            where: { requestId },
            orderBy: { createdAt: 'desc' },
            select: { trajectoryId: true },
        });
        return {
            trajectoryId: (trajectory === null || trajectory === void 0 ? void 0 : trajectory.trajectoryId) || null,
        };
    }
    async findTrajectoryByTripId(tripId) {
        const trajectory = await this.prisma.validatedTrajectory.findFirst({
            where: { tripId },
            orderBy: { createdAt: 'desc' },
            select: { trajectoryId: true },
        });
        return {
            trajectoryId: (trajectory === null || trajectory === void 0 ? void 0 : trajectory.trajectoryId) || null,
        };
    }
    async collectUserFeedback(tripId, userId, feedback) {
        var _a, _b;
        this.logger.log(`[TrajectoryCollection] 收集用户反馈: tripId=${tripId}, userId=${userId}, type=${feedback.type}`);
        if (!this.userFeedbackService || !this.userCapabilityLearningService) {
            this.logger.warn(`[TrajectoryCollection] 用户反馈服务未配置，跳过反馈收集`);
            return;
        }
        try {
            await this.userFeedbackService.submitFeedback({
                tripId,
                userId,
                feedbackType: feedback.type,
                data: feedback.data,
            });
            await this.userCapabilityLearningService.learnUserCapability(userId, feedback);
            const rewardSignals = (_b = (_a = this.rewardExtractor).extractFromUserFeedback) === null || _b === void 0 ? void 0 : _b.call(_a, feedback);
            const trajectory = await this.findTrajectoryByTripId(tripId);
            if (trajectory.trajectoryId && rewardSignals) {
                const existingTrajectory = await this.prisma.validatedTrajectory.findUnique({
                    where: { trajectoryId: trajectory.trajectoryId },
                });
                if (existingTrajectory) {
                    const existingRewardSignals = existingTrajectory.rewardSignals || [];
                    const mergedRewardSignals = this.rewardExtractor.mergeSignals(existingRewardSignals, rewardSignals);
                    const totalReward = this.rewardExtractor.calculateTotalReward(mergedRewardSignals);
                    await this.prisma.validatedTrajectory.update({
                        where: { trajectoryId: trajectory.trajectoryId },
                        data: {
                            rewardSignals: mergedRewardSignals,
                            totalReward,
                        },
                    });
                }
            }
            this.logger.log(`[TrajectoryCollection] 用户反馈已收集并整合到RL流程: tripId=${tripId}`);
        }
        catch (error) {
            this.logger.error(`[TrajectoryCollection] 收集用户反馈失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
        }
    }
};
exports.TrajectoryCollectionService = TrajectoryCollectionService;
exports.TrajectoryCollectionService = TrajectoryCollectionService = TrajectoryCollectionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __param(5, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        trajectory_validator_service_1.TrajectoryValidatorService,
        reward_signal_extractor_service_1.RewardSignalExtractorService,
        roll_trajectory_adapter_service_1.RollTrajectoryAdapterService,
        user_feedback_service_1.UserFeedbackService,
        user_capability_learning_service_1.UserCapabilityLearningService])
], TrajectoryCollectionService);
//# sourceMappingURL=trajectory-collection.service.js.map