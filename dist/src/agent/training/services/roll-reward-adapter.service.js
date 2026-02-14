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
var RollRewardAdapterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RollRewardAdapterService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const roll_client_service_1 = require("./roll-client.service");
let RollRewardAdapterService = RollRewardAdapterService_1 = class RollRewardAdapterService {
    constructor(configService, rollClient) {
        this.configService = configService;
        this.rollClient = rollClient;
        this.logger = new common_1.Logger(RollRewardAdapterService_1.name);
        this.enabled =
            this.configService.get('ROLL_REWARD_ENABLED') !== false &&
                !!this.rollClient;
        this.logger.log(`[RollRewardAdapter] 初始化: enabled=${this.enabled}`);
    }
    async computeReward(plan, userRequest, evidence, decisionLog) {
        if (!this.enabled) {
            throw new Error('ROLL Reward-Worker 未启用');
        }
        this.logger.debug(`[RollRewardAdapter] 计算奖励`);
        try {
            const trajectory = {
                trajectory_id: `traj_${Date.now()}`,
                steps: [
                    {
                        step: 0,
                        state: {
                            user_request: userRequest,
                            plan: plan,
                        },
                        action: {
                            action: 'generate_plan',
                            plan: plan,
                        },
                        reward: 0.0,
                        next_state: {
                            plan_generated: true,
                            evidence: evidence,
                        },
                    },
                ],
                metadata: {
                    decision_log: decisionLog,
                },
            };
            const result = await this.rollClient.callRewardWorker(trajectory);
            if (!result.success) {
                throw new Error(result.error || 'Reward-Worker 调用失败');
            }
            this.logger.debug(`[RollRewardAdapter] 奖励计算完成: reward=${result.reward}`);
            return {
                reward: result.reward || 0,
                rawReward: result.rawReward || 0,
                rewardBreakdown: result.rewardBreakdown || [],
                success: true,
            };
        }
        catch (error) {
            this.logger.warn(`[RollRewardAdapter] 奖励计算失败: error=${error === null || error === void 0 ? void 0 : error.message}`);
            throw error;
        }
    }
    convertToQualityScoreResult(rewardResult, llmJudgeScore, rmScore) {
        const baseScore = rewardResult.reward;
        let finalScore = baseScore;
        if (llmJudgeScore !== undefined && rmScore !== undefined) {
            finalScore = llmJudgeScore * 0.6 + rmScore * 0.4;
        }
        else if (llmJudgeScore !== undefined) {
            finalScore = (baseScore + llmJudgeScore) / 2;
        }
        return {
            score: Math.max(0, Math.min(1, finalScore)),
            llm_judge_score: llmJudgeScore,
            rm_score: rmScore,
            diagnostic_labels: [],
            explanation: `Reward-Worker score: ${baseScore.toFixed(3)}`,
            confidence: 0.8,
        };
    }
};
exports.RollRewardAdapterService = RollRewardAdapterService;
exports.RollRewardAdapterService = RollRewardAdapterService = RollRewardAdapterService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService,
        roll_client_service_1.RollClientService])
], RollRewardAdapterService);
//# sourceMappingURL=roll-reward-adapter.service.js.map