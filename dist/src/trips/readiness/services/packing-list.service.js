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
var PackingListService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackingListService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const readiness_service_1 = require("./readiness.service");
const packing_template_service_1 = require("./packing-template.service");
const luxon_1 = require("luxon");
let PackingListService = PackingListService_1 = class PackingListService {
    constructor(prisma, readinessService, packingTemplateService) {
        this.prisma = prisma;
        this.readinessService = readinessService;
        this.packingTemplateService = packingTemplateService;
        this.logger = new common_1.Logger(PackingListService_1.name);
    }
    async generatePackingList(tripId, dto) {
        var _a, _b, _c;
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const startDate = luxon_1.DateTime.fromJSDate(trip.startDate);
        const endDate = luxon_1.DateTime.fromJSDate(trip.endDate);
        const durationDays = endDate.diff(startDate, 'days').days + 1;
        const useTemplate = dto.useTemplate !== false && (dto.season || dto.userType || dto.activities || dto.route);
        let items = [];
        if (useTemplate) {
            const season = dto.season || this.packingTemplateService.inferSeasonFromDate(trip.startDate);
            const templateItems = this.packingTemplateService.generatePackingList({
                season,
                route: dto.route,
                durationDays: Math.floor(durationDays),
                userType: dto.userType,
                activities: dto.activities,
                vehicleType: dto.vehicleType,
                specialNeeds: dto.specialNeeds,
            });
            items = templateItems.map(item => ({
                id: item.id,
                name: item.nameCN || item.name,
                category: item.category,
                quantity: item.quantity,
                unit: item.unit,
                priority: item.priority,
                reason: item.reason,
                checked: item.checked,
                note: item.note,
            }));
            this.logger.debug(`使用模板生成 ${items.length} 个打包清单项`);
        }
        else {
            const readinessResult = await this.readinessService.checkFromDestination(trip.destination, {
                traveler: {},
                trip: {
                    startDate: trip.startDate.toISOString().split('T')[0],
                    endDate: trip.endDate.toISOString().split('T')[0],
                },
                itinerary: {
                    countries: [trip.destination],
                },
            });
            this.logger.debug(`Readiness check result for trip ${tripId}: ${readinessResult.findings.length} findings`);
            for (const finding of readinessResult.findings) {
                this.logger.debug(`Finding: ${finding.packId || finding.destinationId}, must: ${((_a = finding.must) === null || _a === void 0 ? void 0 : _a.length) || 0}, should: ${((_b = finding.should) === null || _b === void 0 ? void 0 : _b.length) || 0}, optional: ${((_c = finding.optional) === null || _c === void 0 ? void 0 : _c.length) || 0}`);
                if (finding.must && finding.must.length > 0) {
                    const categories = finding.must.map((item) => item.category);
                    this.logger.debug(`Must items categories: ${categories.join(', ')}`);
                }
                if (finding.should && finding.should.length > 0) {
                    const categories = finding.should.map((item) => item.category);
                    this.logger.debug(`Should items categories: ${categories.join(', ')}`);
                }
            }
            items = [];
            const packingRelevantCategories = ['safety_hazards', 'gear_packing', 'health_insurance'];
            for (const finding of readinessResult.findings) {
                for (const mustItem of finding.must || []) {
                    if (packingRelevantCategories.includes(mustItem.category)) {
                        items.push({
                            id: `item-${mustItem.id}`,
                            name: this.extractItemName(mustItem.message),
                            category: this.mapCategory(mustItem.category),
                            quantity: 1,
                            priority: 'must',
                            reason: mustItem.message,
                            sourceFindingId: mustItem.id,
                            checked: false,
                        });
                    }
                }
                for (const shouldItem of finding.should || []) {
                    if (packingRelevantCategories.includes(shouldItem.category)) {
                        items.push({
                            id: `item-${shouldItem.id}`,
                            name: this.extractItemName(shouldItem.message),
                            category: this.mapCategory(shouldItem.category),
                            quantity: 1,
                            priority: 'should',
                            reason: shouldItem.message,
                            sourceFindingId: shouldItem.id,
                            checked: false,
                        });
                    }
                }
                if (dto.includeOptional) {
                    for (const optionalItem of finding.optional || []) {
                        if (packingRelevantCategories.includes(optionalItem.category)) {
                            items.push({
                                id: `item-${optionalItem.id}`,
                                name: this.extractItemName(optionalItem.message),
                                category: this.mapCategory(optionalItem.category),
                                quantity: 1,
                                priority: 'optional',
                                reason: optionalItem.message,
                                sourceFindingId: optionalItem.id,
                                checked: false,
                            });
                        }
                    }
                }
            }
        }
        if (dto.customItems) {
            for (const customItem of dto.customItems) {
                items.push({
                    id: `custom-${Date.now()}-${Math.random()}`,
                    name: customItem.name,
                    category: customItem.category,
                    quantity: customItem.quantity || 1,
                    priority: 'optional',
                    note: customItem.note,
                    checked: false,
                });
            }
        }
        const filteredItems = dto.categories
            ? items.filter((item) => dto.categories.includes(item.category))
            : items;
        await this.prisma.$transaction(async (tx) => {
            await tx.tripPackingListItem.deleteMany({
                where: { tripId },
            });
            if (filteredItems.length > 0) {
                await tx.tripPackingListItem.createMany({
                    data: filteredItems.map((item) => ({
                        tripId,
                        itemName: item.name,
                        category: item.category,
                        quantity: item.quantity,
                        unit: item.unit,
                        priority: item.priority,
                        reason: item.reason,
                        sourceFindingId: item.sourceFindingId,
                        checked: item.checked,
                        note: item.note,
                    })),
                });
            }
        });
        const summary = this.calculateSummary(filteredItems);
        this.logger.debug(`为行程 ${tripId} 生成了 ${filteredItems.length} 个打包清单项`);
        return {
            tripId,
            generatedAt: new Date().toISOString(),
            items: filteredItems,
            summary,
        };
    }
    async getPackingList(tripId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const dbItems = await this.prisma.tripPackingListItem.findMany({
            where: { tripId },
            orderBy: [{ category: 'asc' }, { priority: 'asc' }],
        });
        const items = dbItems.map((item) => ({
            id: item.id,
            name: item.itemName,
            category: item.category,
            quantity: item.quantity,
            unit: item.unit || undefined,
            priority: item.priority,
            reason: item.reason || undefined,
            sourceFindingId: item.sourceFindingId || undefined,
            checked: item.checked,
            note: item.note || undefined,
        }));
        const summary = this.calculateSummary(items);
        const lastGeneratedAt = dbItems.length > 0 ? dbItems[0].createdAt.toISOString() : undefined;
        return {
            tripId,
            items,
            summary,
            lastGeneratedAt,
        };
    }
    async updatePackingListItem(tripId, itemId, dto) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const item = await this.prisma.tripPackingListItem.findFirst({
            where: {
                id: itemId,
                tripId,
            },
        });
        if (!item) {
            throw new common_1.NotFoundException(`打包清单项 ID ${itemId} 不存在`);
        }
        await this.prisma.tripPackingListItem.update({
            where: { id: itemId },
            data: {
                checked: dto.checked !== undefined ? dto.checked : item.checked,
                quantity: dto.quantity !== undefined ? dto.quantity : item.quantity,
                note: dto.note !== undefined ? dto.note : item.note,
            },
        });
        this.logger.debug(`更新了打包清单项 ${itemId}`);
        return {
            itemId,
            updated: true,
        };
    }
    extractItemName(message) {
        if (message.includes('衣物') || message.includes('clothing')) {
            return '分层保暖衣物';
        }
        if (message.includes('车辆') || message.includes('vehicle')) {
            return '4x4 车辆租赁确认单';
        }
        if (message.includes('保险') || message.includes('insurance')) {
            return '旅行保险';
        }
        if (message.includes('防滑') || message.includes('chain')) {
            return '防滑链';
        }
        return message.substring(0, 30);
    }
    mapCategory(category) {
        const categoryMap = {
            safety_hazards: 'gear',
            gear_packing: 'gear',
            entry_transit: 'documents',
            health_insurance: 'medical',
            activities_bookings: 'documents',
            logistics: 'other',
            clothing: 'clothing',
            documents: 'documents',
            electronics: 'electronics',
            food: 'food',
            medical: 'medical',
        };
        return categoryMap[category] || 'other';
    }
    calculateSummary(items) {
        const byCategory = {};
        let checkedItems = 0;
        for (const item of items) {
            byCategory[item.category] = (byCategory[item.category] || 0) + 1;
            if (item.checked) {
                checkedItems++;
            }
        }
        return {
            totalItems: items.length,
            checkedItems,
            byCategory,
        };
    }
};
exports.PackingListService = PackingListService;
exports.PackingListService = PackingListService = PackingListService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        readiness_service_1.ReadinessService,
        packing_template_service_1.PackingTemplateService])
], PackingListService);
//# sourceMappingURL=packing-list.service.js.map