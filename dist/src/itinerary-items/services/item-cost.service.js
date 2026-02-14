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
var ItemCostService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ItemCostService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const create_itinerary_item_dto_1 = require("../dto/create-itinerary-item.dto");
const item_cost_dto_1 = require("../dto/item-cost.dto");
let ItemCostService = ItemCostService_1 = class ItemCostService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(ItemCostService_1.name);
    }
    getDefaultCostCategory(itemType) {
        const mapping = {
            [create_itinerary_item_dto_1.ItemType.ACTIVITY]: item_cost_dto_1.CostCategory.ACTIVITIES,
            [create_itinerary_item_dto_1.ItemType.REST]: item_cost_dto_1.CostCategory.OTHER,
            [create_itinerary_item_dto_1.ItemType.MEAL_ANCHOR]: item_cost_dto_1.CostCategory.FOOD,
            [create_itinerary_item_dto_1.ItemType.MEAL_FLOATING]: item_cost_dto_1.CostCategory.FOOD,
            [create_itinerary_item_dto_1.ItemType.TRANSIT]: item_cost_dto_1.CostCategory.TRANSPORTATION,
        };
        return mapping[itemType] || item_cost_dto_1.CostCategory.OTHER;
    }
    async updateItemCost(itemId, costData) {
        const item = await this.prisma.itineraryItem.findUnique({
            where: { id: itemId },
        });
        if (!item) {
            throw new common_1.NotFoundException(`行程项 ${itemId} 不存在`);
        }
        this.logger.log(`更新行程项费用: ${itemId}, 数据: ${JSON.stringify(costData)}`);
        return this.prisma.itineraryItem.update({
            where: { id: itemId },
            data: {
                estimatedCost: costData.estimatedCost,
                actualCost: costData.actualCost,
                currency: costData.currency,
                costCategory: costData.costCategory,
                costNote: costData.costNote,
                isPaid: costData.isPaid,
                paidBy: costData.paidBy,
            },
            include: {
                Place: {
                    select: {
                        id: true,
                        nameCN: true,
                        nameEN: true,
                        category: true,
                    },
                },
            },
        });
    }
    async batchUpdateCost(dto) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: dto.tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ${dto.tripId} 不存在`);
        }
        const tripItems = await this.prisma.itineraryItem.findMany({
            where: {
                TripDay: {
                    tripId: dto.tripId,
                },
            },
            select: { id: true },
        });
        const validItemIds = new Set(tripItems.map(item => item.id));
        const failedIds = [];
        let updated = 0;
        const updates = dto.items
            .filter(item => {
            if (!validItemIds.has(item.id)) {
                failedIds.push(item.id);
                return false;
            }
            return true;
        })
            .map(item => this.prisma.itineraryItem.update({
            where: { id: item.id },
            data: {
                actualCost: item.actualCost,
                isPaid: item.isPaid,
                costNote: item.costNote,
            },
        }));
        if (updates.length > 0) {
            await this.prisma.$transaction(updates);
            updated = updates.length;
        }
        this.logger.log(`批量更新费用完成: 成功 ${updated} 条, 失败 ${failedIds.length} 条`);
        return {
            updated,
            failed: failedIds.length,
            failedIds: failedIds.length > 0 ? failedIds : undefined,
        };
    }
    async getTripCostSummary(tripId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    include: {
                        ItineraryItem: true,
                    },
                    orderBy: { date: 'asc' },
                },
            },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ${tripId} 不存在`);
        }
        const budgetConfig = trip.budgetConfig || {};
        const totalBudget = budgetConfig.totalBudget || budgetConfig.total || 0;
        const currency = budgetConfig.currency || 'CNY';
        let totalEstimated = 0;
        let totalActual = 0;
        let totalPaid = 0;
        let totalUnpaid = 0;
        const byCategory = {};
        const byDay = [];
        Object.values(item_cost_dto_1.CostCategory).forEach(cat => {
            byCategory[cat] = { estimated: 0, actual: 0, count: 0 };
        });
        for (const day of trip.TripDay) {
            let dayEstimated = 0;
            let dayActual = 0;
            let dayItemCount = 0;
            for (const item of day.ItineraryItem) {
                const estimated = item.estimatedCost || 0;
                const actual = item.actualCost || 0;
                const category = item.costCategory || item_cost_dto_1.CostCategory.OTHER;
                const isPaid = item.isPaid || false;
                totalEstimated += estimated;
                totalActual += actual;
                if (isPaid) {
                    totalPaid += actual || estimated;
                }
                else if (actual > 0 || estimated > 0) {
                    totalUnpaid += actual || estimated;
                }
                dayEstimated += estimated;
                dayActual += actual;
                if (estimated > 0 || actual > 0) {
                    dayItemCount++;
                }
                if (byCategory[category]) {
                    byCategory[category].estimated += estimated;
                    byCategory[category].actual += actual;
                    if (estimated > 0 || actual > 0) {
                        byCategory[category].count++;
                    }
                }
            }
            byDay.push({
                date: day.date.toISOString().split('T')[0],
                estimated: Math.round(dayEstimated * 100) / 100,
                actual: Math.round(dayActual * 100) / 100,
                itemCount: dayItemCount,
            });
        }
        const varianceAmount = totalActual - totalEstimated;
        const variancePercentage = totalEstimated > 0
            ? (varianceAmount / totalEstimated) * 100
            : 0;
        let status;
        if (totalBudget > 0 && totalActual > totalBudget) {
            status = 'OVER_BUDGET';
        }
        else if (totalActual < totalEstimated * 0.95) {
            status = 'UNDER_BUDGET';
        }
        else {
            status = 'ON_BUDGET';
        }
        const budgetUsagePercent = totalBudget > 0
            ? Math.round((totalActual / totalBudget) * 10000) / 100
            : 0;
        const roundedByCategory = {};
        Object.entries(byCategory).forEach(([key, value]) => {
            roundedByCategory[key] = {
                estimated: Math.round(value.estimated * 100) / 100,
                actual: Math.round(value.actual * 100) / 100,
                count: value.count,
            };
        });
        return {
            totalBudget: Math.round(totalBudget * 100) / 100,
            totalEstimated: Math.round(totalEstimated * 100) / 100,
            totalActual: Math.round(totalActual * 100) / 100,
            totalPaid: Math.round(totalPaid * 100) / 100,
            totalUnpaid: Math.round(totalUnpaid * 100) / 100,
            currency,
            byCategory: roundedByCategory,
            byDay,
            variance: {
                amount: Math.round(varianceAmount * 100) / 100,
                percentage: Math.round(variancePercentage * 100) / 100,
                status,
            },
            budgetUsagePercent,
        };
    }
    async getItemCost(itemId) {
        const item = await this.prisma.itineraryItem.findUnique({
            where: { id: itemId },
            select: {
                id: true,
                estimatedCost: true,
                actualCost: true,
                currency: true,
                costCategory: true,
                costNote: true,
                isPaid: true,
                paidBy: true,
                type: true,
                Place: {
                    select: {
                        nameCN: true,
                        nameEN: true,
                    },
                },
            },
        });
        if (!item) {
            throw new common_1.NotFoundException(`行程项 ${itemId} 不存在`);
        }
        return item;
    }
    async getUnpaidItems(tripId) {
        const items = await this.prisma.itineraryItem.findMany({
            where: {
                TripDay: {
                    tripId,
                },
                isPaid: false,
                OR: [
                    { estimatedCost: { gt: 0 } },
                    { actualCost: { gt: 0 } },
                ],
            },
            include: {
                Place: {
                    select: {
                        nameCN: true,
                        nameEN: true,
                    },
                },
                TripDay: {
                    select: {
                        date: true,
                    },
                },
            },
            orderBy: {
                TripDay: {
                    date: 'asc',
                },
            },
        });
        return items.map(item => {
            var _a, _b;
            return ({
                id: item.id,
                placeName: ((_a = item.Place) === null || _a === void 0 ? void 0 : _a.nameCN) || ((_b = item.Place) === null || _b === void 0 ? void 0 : _b.nameEN) || '未知地点',
                date: item.TripDay.date.toISOString().split('T')[0],
                estimatedCost: item.estimatedCost,
                actualCost: item.actualCost,
                currency: item.currency,
                costCategory: item.costCategory,
                costNote: item.costNote,
            });
        });
    }
};
exports.ItemCostService = ItemCostService;
exports.ItemCostService = ItemCostService = ItemCostService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ItemCostService);
//# sourceMappingURL=item-cost.service.js.map