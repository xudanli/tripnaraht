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
var FindingMarksService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindingMarksService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let FindingMarksService = FindingMarksService_1 = class FindingMarksService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(FindingMarksService_1.name);
    }
    async markNotApplicable(tripId, findingId, dto) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const mark = await this.prisma.tripFindingMark.upsert({
            where: {
                tripId_findingId_markType: {
                    tripId,
                    findingId,
                    markType: 'not_applicable',
                },
            },
            update: {
                reason: dto.reason,
                createdAt: new Date(),
            },
            create: {
                tripId,
                findingId,
                markType: 'not_applicable',
                reason: dto.reason,
            },
        });
        this.logger.debug(`标记 finding ${findingId} 为不适用`);
        return {
            findingId,
            marked: true,
            reason: mark.reason || undefined,
            markedAt: mark.createdAt.toISOString(),
        };
    }
    async unmarkNotApplicable(tripId, findingId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        await this.prisma.tripFindingMark.deleteMany({
            where: {
                tripId,
                findingId,
                markType: 'not_applicable',
            },
        });
        this.logger.debug(`取消标记 finding ${findingId} 为不适用`);
        return {
            findingId,
            marked: false,
        };
    }
    async getNotApplicableItems(tripId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const marks = await this.prisma.tripFindingMark.findMany({
            where: {
                tripId,
                markType: 'not_applicable',
            },
            orderBy: { createdAt: 'desc' },
        });
        return {
            notApplicableItems: marks.map((mark) => ({
                findingId: mark.findingId,
                reason: mark.reason || undefined,
                markedAt: mark.createdAt.toISOString(),
            })),
        };
    }
    async addToLater(tripId, findingId, dto) {
        var _a;
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const mark = await this.prisma.tripFindingMark.upsert({
            where: {
                tripId_findingId_markType: {
                    tripId,
                    findingId,
                    markType: 'later',
                },
            },
            update: {
                reminderDate: dto.reminderDate ? new Date(dto.reminderDate) : null,
                note: dto.note,
                createdAt: new Date(),
            },
            create: {
                tripId,
                findingId,
                markType: 'later',
                reminderDate: dto.reminderDate ? new Date(dto.reminderDate) : null,
                note: dto.note,
            },
        });
        this.logger.debug(`添加 finding ${findingId} 到稍后处理`);
        return {
            findingId,
            added: true,
            reminderDate: (_a = mark.reminderDate) === null || _a === void 0 ? void 0 : _a.toISOString(),
            note: mark.note || undefined,
            addedAt: mark.createdAt.toISOString(),
        };
    }
    async removeFromLater(tripId, findingId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        await this.prisma.tripFindingMark.deleteMany({
            where: {
                tripId,
                findingId,
                markType: 'later',
            },
        });
        this.logger.debug(`从稍后处理移除 finding ${findingId}`);
        return {
            findingId,
            removed: true,
        };
    }
    async getLaterItems(tripId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const marks = await this.prisma.tripFindingMark.findMany({
            where: {
                tripId,
                markType: 'later',
            },
            orderBy: { createdAt: 'desc' },
        });
        return {
            laterItems: marks.map((mark) => {
                var _a;
                return ({
                    findingId: mark.findingId,
                    reminderDate: (_a = mark.reminderDate) === null || _a === void 0 ? void 0 : _a.toISOString(),
                    note: mark.note || undefined,
                    addedAt: mark.createdAt.toISOString(),
                });
            }),
        };
    }
};
exports.FindingMarksService = FindingMarksService;
exports.FindingMarksService = FindingMarksService = FindingMarksService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], FindingMarksService);
//# sourceMappingURL=finding-marks.service.js.map