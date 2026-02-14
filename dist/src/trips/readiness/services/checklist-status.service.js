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
var ChecklistStatusService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChecklistStatusService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let ChecklistStatusService = ChecklistStatusService_1 = class ChecklistStatusService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(ChecklistStatusService_1.name);
    }
    async updateChecklistStatus(tripId, dto) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const updated = await this.prisma.$transaction(async (tx) => {
            await tx.tripChecklistStatus.deleteMany({
                where: { tripId },
            });
            if (dto.checkedItems.length > 0) {
                await tx.tripChecklistStatus.createMany({
                    data: dto.checkedItems.map((findingId) => ({
                        tripId,
                        findingId,
                        checked: true,
                    })),
                });
            }
            return dto.checkedItems.length;
        });
        this.logger.debug(`更新了 ${updated} 个检查清单项的状态`);
        return {
            updated,
            checkedItems: dto.checkedItems,
        };
    }
    async getChecklistStatus(tripId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const statuses = await this.prisma.tripChecklistStatus.findMany({
            where: { tripId },
            orderBy: { updatedAt: 'desc' },
        });
        const lastUpdated = statuses.length > 0
            ? statuses[0].updatedAt.toISOString()
            : new Date().toISOString();
        return {
            checkedItems: statuses.map((s) => s.findingId),
            lastUpdated,
        };
    }
};
exports.ChecklistStatusService = ChecklistStatusService;
exports.ChecklistStatusService = ChecklistStatusService = ChecklistStatusService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ChecklistStatusService);
//# sourceMappingURL=checklist-status.service.js.map