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
var RollBatchProcessorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RollBatchProcessorService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const roll_client_service_1 = require("./roll-client.service");
let RollBatchProcessorService = RollBatchProcessorService_1 = class RollBatchProcessorService {
    constructor(configService, rollClient) {
        this.configService = configService;
        this.rollClient = rollClient;
        this.logger = new common_1.Logger(RollBatchProcessorService_1.name);
        this.actorBatchQueue = [];
        this.rewardBatchQueue = [];
        this.policyBatchQueue = [];
        this.actorBatchTimer = null;
        this.rewardBatchTimer = null;
        this.policyBatchTimer = null;
        this.batchSize = parseInt(this.configService.get('ROLL_BATCH_SIZE') || '10', 10);
        this.batchTimeout = parseInt(this.configService.get('ROLL_BATCH_TIMEOUT') || '100', 10);
    }
    async batchGenerateTrajectory(request) {
        return new Promise((resolve, reject) => {
            const item = {
                id: `actor-${Date.now()}-${Math.random()}`,
                request,
                resolve,
                reject,
            };
            this.actorBatchQueue.push(item);
            if (this.actorBatchQueue.length >= this.batchSize) {
                this.processActorBatch();
            }
            else {
                if (!this.actorBatchTimer) {
                    this.actorBatchTimer = setTimeout(() => {
                        this.processActorBatch();
                    }, this.batchTimeout);
                }
            }
        });
    }
    async batchComputeReward(trajectory, rewardConfig) {
        return new Promise((resolve, reject) => {
            const item = {
                id: `reward-${Date.now()}-${Math.random()}`,
                request: { trajectory, rewardConfig },
                resolve,
                reject,
            };
            this.rewardBatchQueue.push(item);
            if (this.rewardBatchQueue.length >= this.batchSize) {
                this.processRewardBatch();
            }
            else {
                if (!this.rewardBatchTimer) {
                    this.rewardBatchTimer = setTimeout(() => {
                        this.processRewardBatch();
                    }, this.batchTimeout);
                }
            }
        });
    }
    async batchPredict(state) {
        return new Promise((resolve, reject) => {
            const item = {
                id: `policy-${Date.now()}-${Math.random()}`,
                request: state,
                resolve,
                reject,
            };
            this.policyBatchQueue.push(item);
            if (this.policyBatchQueue.length >= this.batchSize) {
                this.processPolicyBatch();
            }
            else {
                if (!this.policyBatchTimer) {
                    this.policyBatchTimer = setTimeout(() => {
                        this.processPolicyBatch();
                    }, this.batchTimeout);
                }
            }
        });
    }
    async processActorBatch() {
        if (this.actorBatchTimer) {
            clearTimeout(this.actorBatchTimer);
            this.actorBatchTimer = null;
        }
        if (this.actorBatchQueue.length === 0) {
            return;
        }
        const batch = this.actorBatchQueue.splice(0, this.batchSize);
        this.logger.debug(`[RollBatch] 处理 Actor 批量请求: ${batch.length} 项`);
        const promises = batch.map((item) => this.rollClient
            .callActorWorker(item.request)
            .then((result) => item.resolve(result))
            .catch((error) => item.reject(error)));
        await Promise.allSettled(promises);
    }
    async processRewardBatch() {
        if (this.rewardBatchTimer) {
            clearTimeout(this.rewardBatchTimer);
            this.rewardBatchTimer = null;
        }
        if (this.rewardBatchQueue.length === 0) {
            return;
        }
        const batch = this.rewardBatchQueue.splice(0, this.batchSize);
        this.logger.debug(`[RollBatch] 处理 Reward 批量请求: ${batch.length} 项`);
        const promises = batch.map((item) => this.rollClient
            .callRewardWorker(item.request.trajectory, item.request.rewardConfig)
            .then((result) => item.resolve(result))
            .catch((error) => item.reject(error)));
        await Promise.allSettled(promises);
    }
    async processPolicyBatch() {
        if (this.policyBatchTimer) {
            clearTimeout(this.policyBatchTimer);
            this.policyBatchTimer = null;
        }
        if (this.policyBatchQueue.length === 0) {
            return;
        }
        const batch = this.policyBatchQueue.splice(0, this.batchSize);
        this.logger.debug(`[RollBatch] 处理 Policy 批量请求: ${batch.length} 项`);
        const promises = batch.map((item) => this.rollClient
            .callPolicyWorker(item.request)
            .then((result) => item.resolve(result))
            .catch((error) => item.reject(error)));
        await Promise.allSettled(promises);
    }
};
exports.RollBatchProcessorService = RollBatchProcessorService;
exports.RollBatchProcessorService = RollBatchProcessorService = RollBatchProcessorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        roll_client_service_1.RollClientService])
], RollBatchProcessorService);
//# sourceMappingURL=roll-batch-processor.service.js.map