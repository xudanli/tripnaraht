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
var RewardModelTrainerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RewardModelTrainerService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let RewardModelTrainerService = RewardModelTrainerService_1 = class RewardModelTrainerService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(RewardModelTrainerService_1.name);
        this.trainingServiceUrl =
            this.configService.get('TRAINING_SERVICE_URL') ||
                'http://localhost:8001';
    }
    async trainWithPreferenceComparison(preferenceData, config = {}) {
        this.logger.log(`[RewardModelTrainer] 开始偏好对比训练: samples=${preferenceData.length}`);
        try {
            const response = await fetch(`${this.trainingServiceUrl}/rm/train/preference`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    preference_data: preferenceData,
                    config,
                }),
            });
            if (!response.ok) {
                throw new Error(`RM training error: ${response.statusText}`);
            }
            const result = (await response.json());
            this.logger.log(`[RewardModelTrainer] RM训练完成: modelVersion=${result.model_version}`);
            return result;
        }
        catch (error) {
            this.logger.error(`[RewardModelTrainer] RM训练失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            throw error;
        }
    }
    async trainWithScoreRegression(scoreData, config = {}) {
        this.logger.log(`[RewardModelTrainer] 开始评分回归训练: samples=${scoreData.length}`);
        try {
            const response = await fetch(`${this.trainingServiceUrl}/rm/train/regression`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    score_data: scoreData,
                    config,
                }),
            });
            if (!response.ok) {
                throw new Error(`RM training error: ${response.statusText}`);
            }
            const result = (await response.json());
            this.logger.log(`[RewardModelTrainer] RM训练完成: modelVersion=${result.model_version}`);
            return result;
        }
        catch (error) {
            this.logger.error(`[RewardModelTrainer] RM训练失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            throw error;
        }
    }
};
exports.RewardModelTrainerService = RewardModelTrainerService;
exports.RewardModelTrainerService = RewardModelTrainerService = RewardModelTrainerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RewardModelTrainerService);
//# sourceMappingURL=reward-model-trainer.service.js.map