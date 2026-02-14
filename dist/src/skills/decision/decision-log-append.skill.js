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
var DecisionLogAppendSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionLogAppendSkill = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const decision_log_storage_service_1 = require("../../trips/decision/services/decision-log-storage.service");
let DecisionLogAppendSkill = DecisionLogAppendSkill_1 = class DecisionLogAppendSkill {
    constructor(prisma, decisionLogStorage) {
        this.prisma = prisma;
        this.decisionLogStorage = decisionLogStorage;
        this.logger = new common_1.Logger(DecisionLogAppendSkill_1.name);
        this.metadata = {
            name: 'decision.logAppend',
            description: '决策日志写入：把三人格输出写入可检索事件流',
            version: '1.0.0',
            category: 'decision',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 decision.logAppend: tripId=${input.tripId || 'none'}, entries=${input.entries.length}`);
        const logIds = [];
        const errors = [];
        let successfulEntries = 0;
        try {
            if (!this.decisionLogStorage) {
                throw new Error('DecisionLogStorageService 未注入');
            }
            const logEntries = input.entries.map((entry) => ({
                persona: entry.persona,
                action: entry.action,
                reasonCodes: entry.reasonCodes,
                explanation: entry.explanation,
                decisionSource: (entry.decisionSource || 'HEURISTIC'),
                decisionStage: (entry.decisionStage || 'FINALIZE'),
                evidenceRefs: entry.evidenceRefs || [],
                timestamp: entry.timestamp || new Date().toISOString(),
            }));
            await this.decisionLogStorage.saveLogEntries(logEntries, {
                tripId: input.tripId,
                countryCode: input.countryCode,
                routeDirectionId: input.routeDirectionId,
                metadata: input.metadata,
            });
            if (this.prisma && input.tripId) {
                const savedLogs = await this.prisma.decisionLog.findMany({
                    where: {
                        tripId: input.tripId,
                    },
                    orderBy: {
                        timestamp: 'desc',
                    },
                    take: input.entries.length,
                });
                logIds.push(...savedLogs.map((log) => log.id));
                successfulEntries = savedLogs.length;
            }
            else {
                successfulEntries = input.entries.length;
            }
            return {
                writtenCount: successfulEntries,
                logIds,
                summary: {
                    totalEntries: input.entries.length,
                    successfulEntries,
                    failedEntries: input.entries.length - successfulEntries,
                    errors: errors.length > 0 ? errors : undefined,
                },
            };
        }
        catch (error) {
            this.logger.error(`决策日志写入失败: ${error.message}`, error.stack);
            errors.push(error.message);
            return {
                writtenCount: successfulEntries,
                logIds,
                summary: {
                    totalEntries: input.entries.length,
                    successfulEntries,
                    failedEntries: input.entries.length - successfulEntries,
                    errors,
                },
            };
        }
    }
};
exports.DecisionLogAppendSkill = DecisionLogAppendSkill;
exports.DecisionLogAppendSkill = DecisionLogAppendSkill = DecisionLogAppendSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('PrismaService')),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        decision_log_storage_service_1.DecisionLogStorageService])
], DecisionLogAppendSkill);
//# sourceMappingURL=decision-log-append.skill.js.map