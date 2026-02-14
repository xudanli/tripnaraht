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
var CapabilityPackChecklistService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CapabilityPackChecklistService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let CapabilityPackChecklistService = CapabilityPackChecklistService_1 = class CapabilityPackChecklistService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(CapabilityPackChecklistService_1.name);
    }
    async addFromCapabilityPack(tripId, request) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const addedItems = [];
        let skippedCount = 0;
        for (const rule of request.rules) {
            try {
                const item = await this.prisma.tripCapabilityPackItem.upsert({
                    where: {
                        tripId_ruleId_sourcePackType: {
                            tripId,
                            ruleId: rule.id,
                            sourcePackType: request.packType,
                        },
                    },
                    update: {
                        level: rule.level,
                        message: rule.message,
                        category: rule.category,
                        tasks: rule.tasks,
                    },
                    create: {
                        tripId,
                        ruleId: rule.id,
                        sourcePackType: request.packType,
                        level: rule.level,
                        message: rule.message,
                        category: rule.category,
                        tasks: rule.tasks,
                    },
                });
                addedItems.push({
                    id: item.id,
                    ruleId: item.ruleId,
                    message: item.message,
                    level: item.level,
                    category: item.category || undefined,
                    tasks: item.tasks,
                    sourcePackType: item.sourcePackType,
                    checked: item.checked,
                    createdAt: item.createdAt.toISOString(),
                });
            }
            catch (error) {
                this.logger.warn(`跳过规则 ${rule.id}: ${error.message}`);
                skippedCount++;
            }
        }
        this.logger.log(`为行程 ${tripId} 从能力包 ${request.packType} 添加了 ${addedItems.length} 条规则`);
        return {
            success: true,
            addedCount: addedItems.length,
            skippedCount,
            items: addedItems,
        };
    }
    async getCapabilityPackItems(tripId, packType) {
        const where = { tripId };
        if (packType) {
            where.sourcePackType = packType;
        }
        const items = await this.prisma.tripCapabilityPackItem.findMany({
            where,
            orderBy: [
                { sourcePackType: 'asc' },
                { level: 'asc' },
                { createdAt: 'asc' },
            ],
        });
        return items.map((item) => ({
            id: item.id,
            ruleId: item.ruleId,
            message: item.message,
            level: item.level,
            category: item.category || undefined,
            tasks: item.tasks,
            sourcePackType: item.sourcePackType,
            checked: item.checked,
            createdAt: item.createdAt.toISOString(),
        }));
    }
    async updateItemStatus(tripId, itemId, checked) {
        const item = await this.prisma.tripCapabilityPackItem.update({
            where: {
                id: itemId,
                tripId,
            },
            data: { checked },
        });
        return {
            id: item.id,
            ruleId: item.ruleId,
            message: item.message,
            level: item.level,
            category: item.category || undefined,
            tasks: item.tasks,
            sourcePackType: item.sourcePackType,
            checked: item.checked,
            createdAt: item.createdAt.toISOString(),
        };
    }
    async batchUpdateItemStatus(tripId, updates) {
        let updatedCount = 0;
        for (const update of updates) {
            try {
                await this.prisma.tripCapabilityPackItem.update({
                    where: {
                        id: update.itemId,
                        tripId,
                    },
                    data: { checked: update.checked },
                });
                updatedCount++;
            }
            catch (error) {
                this.logger.warn(`更新项 ${update.itemId} 失败: ${error.message}`);
            }
        }
        return { updatedCount };
    }
    async removeItem(tripId, itemId) {
        await this.prisma.tripCapabilityPackItem.delete({
            where: {
                id: itemId,
                tripId,
            },
        });
        return { removed: true };
    }
    async removeByPackType(tripId, packType) {
        const result = await this.prisma.tripCapabilityPackItem.deleteMany({
            where: {
                tripId,
                sourcePackType: packType,
            },
        });
        return { removedCount: result.count };
    }
    async getItemsGroupedByLevel(tripId) {
        const items = await this.getCapabilityPackItems(tripId);
        return {
            blocker: items.filter((i) => i.level === 'blocker'),
            must: items.filter((i) => i.level === 'must'),
            should: items.filter((i) => i.level === 'should'),
            optional: items.filter((i) => i.level === 'optional'),
        };
    }
};
exports.CapabilityPackChecklistService = CapabilityPackChecklistService;
exports.CapabilityPackChecklistService = CapabilityPackChecklistService = CapabilityPackChecklistService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CapabilityPackChecklistService);
//# sourceMappingURL=capability-pack-checklist.service.js.map