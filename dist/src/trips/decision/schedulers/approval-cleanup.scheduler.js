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
var ApprovalCleanupScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApprovalCleanupScheduler = void 0;
const common_1 = require("@nestjs/common");
const approval_service_1 = require("../services/approval.service");
let ApprovalCleanupScheduler = ApprovalCleanupScheduler_1 = class ApprovalCleanupScheduler {
    constructor(approvalService) {
        this.approvalService = approvalService;
        this.logger = new common_1.Logger(ApprovalCleanupScheduler_1.name);
    }
    onModuleInit() {
        this.logger.log('ApprovalCleanupScheduler 已启动（定时任务已临时禁用）');
    }
    async handleCleanup() {
        try {
            const count = await this.approvalService.cleanupExpiredRequests();
            if (count > 0) {
                this.logger.log(`清理了 ${count} 个过期的审批请求`);
            }
            return count;
        }
        catch (error) {
            this.logger.error(`清理过期审批请求失败: ${error.message}`, error.stack);
        }
    }
};
exports.ApprovalCleanupScheduler = ApprovalCleanupScheduler;
exports.ApprovalCleanupScheduler = ApprovalCleanupScheduler = ApprovalCleanupScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [approval_service_1.ApprovalService])
], ApprovalCleanupScheduler);
//# sourceMappingURL=approval-cleanup.scheduler.js.map