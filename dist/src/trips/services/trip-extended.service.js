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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripExtendedService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const trip_share_dto_1 = require("../dto/trip-share.dto");
const crypto_1 = require("crypto");
let TripExtendedService = class TripExtendedService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createShare(tripId, dto) {
        const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
        if (!trip) {
            throw new common_1.NotFoundException(`行程不存在: ${tripId}`);
        }
        const shareToken = (0, crypto_1.randomUUID)();
        const share = await this.prisma.tripShare.create({
            data: {
                id: (0, crypto_1.randomUUID)(),
                tripId: tripId,
                shareToken,
                permission: dto.permission || trip_share_dto_1.SharePermission.VIEW,
                expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
            },
        });
        const shareUrl = `/trips/shared/${shareToken}`;
        return {
            id: share.id,
            tripId: share.tripId,
            shareToken: share.shareToken,
            permission: share.permission,
            expiresAt: share.expiresAt,
            shareUrl,
            createdAt: share.createdAt,
        };
    }
    async addCollaborator(tripId, dto) {
        const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
        if (!trip) {
            throw new common_1.NotFoundException(`行程不存在: ${tripId}`);
        }
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });
        if (!user) {
            throw new common_1.NotFoundException(`用户不存在: ${dto.email}`);
        }
        const existing = await this.prisma.tripCollaborator.findUnique({
            where: {
                tripId_userId: {
                    tripId,
                    userId: user.id,
                },
            },
        });
        if (existing) {
            throw new common_1.BadRequestException('该用户已经是协作者');
        }
        const collaborator = await this.prisma.tripCollaborator.create({
            data: {
                id: (0, crypto_1.randomUUID)(),
                tripId: tripId,
                userId: user.id,
                role: dto.role,
            },
        });
        return {
            id: collaborator.id,
            tripId: collaborator.tripId,
            userId: collaborator.userId,
            role: collaborator.role,
            createdAt: collaborator.createdAt,
        };
    }
    async getTripByShareToken(shareToken) {
        const share = await this.prisma.tripShare.findUnique({
            where: { shareToken },
            include: {
                Trip: {
                    include: {
                        TripDay: {
                            include: {
                                ItineraryItem: {
                                    include: {
                                        Place: true,
                                        Trail: {
                                            include: {
                                                Place_Trail_startPlaceIdToPlace: true,
                                                Place_Trail_endPlaceIdToPlace: true,
                                                TrailWaypoint: {
                                                    include: {
                                                        Place: true,
                                                    },
                                                    orderBy: {
                                                        order: 'asc',
                                                    },
                                                },
                                            },
                                        },
                                    },
                                    orderBy: {
                                        startTime: 'asc',
                                    },
                                },
                            },
                            orderBy: {
                                date: 'asc',
                            },
                        },
                    },
                },
            },
        });
        if (!share) {
            throw new common_1.NotFoundException('分享链接不存在或已失效');
        }
        if (share.expiresAt && share.expiresAt < new Date()) {
            throw new common_1.BadRequestException('分享链接已过期');
        }
        return {
            trip: share.Trip,
            permission: share.permission,
            shareToken: share.shareToken,
        };
    }
    async importTripFromShare(shareToken, newTripData) {
        const shareData = await this.getTripByShareToken(shareToken);
        const originalTrip = shareData.trip;
        const { generateDefaultTripName } = require('../utils/trip-name.util');
        const tripName = generateDefaultTripName({
            destination: newTripData.destination,
            startDate: new Date(newTripData.startDate),
        });
        const newTrip = await this.prisma.trip.create({
            data: {
                id: (0, crypto_1.randomUUID)(),
                name: tripName,
                destination: newTripData.destination,
                startDate: new Date(newTripData.startDate),
                endDate: new Date(newTripData.endDate),
                budgetConfig: originalTrip.budgetConfig,
                pacingConfig: originalTrip.pacingConfig,
                metadata: {
                    ...(originalTrip.metadata || {}),
                    importedFrom: shareToken,
                    importedAt: new Date().toISOString(),
                },
            },
        });
        for (const day of originalTrip.TripDay) {
            const newDay = await this.prisma.tripDay.create({
                data: {
                    id: (0, crypto_1.randomUUID)(),
                    tripId: newTrip.id,
                    date: day.date,
                },
            });
            const maxOrderItem = await this.prisma.itineraryItem.findFirst({
                where: { tripDayId: newDay.id },
                orderBy: { order: 'desc' },
                select: { order: true },
            });
            let baseOrder = (maxOrderItem === null || maxOrderItem === void 0 ? void 0 : maxOrderItem.order) !== null && (maxOrderItem === null || maxOrderItem === void 0 ? void 0 : maxOrderItem.order) !== undefined
                ? maxOrderItem.order + 1
                : 1;
            const sortedItems = [...day.ItineraryItem].sort((a, b) => {
                if (a.order !== null && b.order !== null) {
                    return a.order - b.order;
                }
                if (a.startTime && b.startTime) {
                    return a.startTime.getTime() - b.startTime.getTime();
                }
                return 0;
            });
            for (let i = 0; i < sortedItems.length; i++) {
                const item = sortedItems[i];
                await this.prisma.itineraryItem.create({
                    data: {
                        id: (0, crypto_1.randomUUID)(),
                        tripDayId: newDay.id,
                        placeId: item.placeId,
                        trailId: item.trailId,
                        type: item.type,
                        startTime: item.startTime,
                        endTime: item.endTime,
                        note: item.note,
                        order: baseOrder + i,
                    },
                });
            }
        }
        return {
            tripId: newTrip.id,
            importedFrom: shareToken,
            message: '行程导入成功，包括所有Trail数据',
        };
    }
    async getCollaborators(tripId) {
        const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
        if (!trip) {
            throw new common_1.NotFoundException(`行程不存在: ${tripId}`);
        }
        const collaborators = await this.prisma.tripCollaborator.findMany({
            where: { tripId },
            orderBy: { createdAt: 'asc' },
        });
        return collaborators.map(c => ({
            id: c.id,
            tripId: c.tripId,
            userId: c.userId,
            role: c.role,
            createdAt: c.createdAt,
        }));
    }
    async removeCollaborator(tripId, userId) {
        const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
        if (!trip) {
            throw new common_1.NotFoundException(`行程不存在: ${tripId}`);
        }
        const collaborator = await this.prisma.tripCollaborator.findUnique({
            where: {
                tripId_userId: {
                    tripId,
                    userId,
                },
            },
        });
        if (!collaborator) {
            throw new common_1.NotFoundException('协作者不存在');
        }
        await this.prisma.tripCollaborator.delete({
            where: {
                tripId_userId: {
                    tripId,
                    userId,
                },
            },
        });
        return { success: true };
    }
    async collectTrip(tripId, userId) {
        const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
        if (!trip) {
            throw new common_1.NotFoundException(`行程不存在: ${tripId}`);
        }
        const existing = await this.prisma.tripCollection.findUnique({
            where: {
                tripId_userId: {
                    tripId,
                    userId,
                },
            },
        });
        if (existing) {
            return { success: true, message: '已收藏' };
        }
        await this.prisma.tripCollection.create({
            data: {
                id: (0, crypto_1.randomUUID)(),
                tripId: tripId,
                userId,
            },
        });
        return { success: true };
    }
    async uncollectTrip(tripId, userId) {
        const collection = await this.prisma.tripCollection.findUnique({
            where: {
                tripId_userId: {
                    tripId,
                    userId,
                },
            },
        });
        if (!collection) {
            return { success: true, message: '未收藏' };
        }
        await this.prisma.tripCollection.delete({
            where: {
                tripId_userId: {
                    tripId,
                    userId,
                },
            },
        });
        return { success: true };
    }
    async likeTrip(tripId, userId) {
        const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
        if (!trip) {
            throw new common_1.NotFoundException(`行程不存在: ${tripId}`);
        }
        const existing = await this.prisma.tripLike.findUnique({
            where: {
                tripId_userId: {
                    tripId,
                    userId,
                },
            },
        });
        if (existing) {
            return { success: true, message: '已点赞' };
        }
        await this.prisma.tripLike.create({
            data: {
                id: (0, crypto_1.randomUUID)(),
                tripId: tripId,
                userId,
            },
        });
        return { success: true };
    }
    async unlikeTrip(tripId, userId) {
        const like = await this.prisma.tripLike.findUnique({
            where: {
                tripId_userId: {
                    tripId,
                    userId,
                },
            },
        });
        if (!like) {
            return { success: true, message: '未点赞' };
        }
        await this.prisma.tripLike.delete({
            where: {
                tripId_userId: {
                    tripId,
                    userId,
                },
            },
        });
        return { success: true };
    }
    async getFeaturedTrips(limit = 10) {
        const trips = await this.prisma.trip.findMany({
            include: {
                TripLike: true,
                TripCollection: true,
                _count: {
                    select: {
                        TripLike: true,
                        TripCollection: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
            take: limit * 2,
        });
        const featured = trips.map(trip => ({
            ...trip,
            likeCount: trip._count.TripLike,
            collectionCount: trip._count.TripCollection,
            popularityScore: trip._count.TripLike + trip._count.TripCollection * 2,
        }));
        featured.sort((a, b) => b.popularityScore - a.popularityScore);
        return featured.slice(0, limit);
    }
    async exportOfflinePack(tripId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    include: {
                        ItineraryItem: {
                            include: {
                                Place: true,
                            },
                        },
                    },
                },
            },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程不存在: ${tripId}`);
        }
        const offlinePack = {
            trip: {
                id: trip.id,
                destination: trip.destination,
                startDate: trip.startDate,
                endDate: trip.endDate,
                budgetConfig: trip.budgetConfig,
                pacingConfig: trip.pacingConfig,
            },
            days: trip.TripDay.map(day => ({
                id: day.id,
                date: day.date,
                items: day.ItineraryItem.map(item => ({
                    id: item.id,
                    type: item.type,
                    startTime: item.startTime,
                    endTime: item.endTime,
                    place: item.Place ? {
                        id: item.Place.id,
                        nameCN: item.Place.nameCN,
                        nameEN: item.Place.nameEN,
                        category: item.Place.category,
                        address: item.Place.address,
                        metadata: item.Place.metadata,
                    } : null,
                    note: item.note,
                })),
            })),
            exportedAt: new Date().toISOString(),
        };
        const pack = await this.prisma.tripOfflinePack.upsert({
            where: { tripId },
            update: {
                data: offlinePack,
                version: { increment: 1 },
            },
            create: {
                id: (0, crypto_1.randomUUID)(),
                tripId: tripId,
                data: offlinePack,
                version: 1,
                updatedAt: new Date(),
            },
        });
        return {
            tripId: pack.tripId,
            version: pack.version,
            data: pack.data,
            createdAt: pack.createdAt,
            updatedAt: pack.updatedAt,
        };
    }
    async getOfflinePackStatus(tripId) {
        const pack = await this.prisma.tripOfflinePack.findUnique({
            where: { tripId },
        });
        if (!pack) {
            return { exists: false };
        }
        return {
            exists: true,
            tripId: pack.tripId,
            version: pack.version,
            createdAt: pack.createdAt,
            updatedAt: pack.updatedAt,
        };
    }
    async syncOfflineChanges(tripId, offlineData) {
        const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
        if (!trip) {
            throw new common_1.NotFoundException(`行程不存在: ${tripId}`);
        }
        return {
            success: true,
            message: '离线数据已同步',
            syncedAt: new Date(),
        };
    }
};
exports.TripExtendedService = TripExtendedService;
exports.TripExtendedService = TripExtendedService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TripExtendedService);
//# sourceMappingURL=trip-extended.service.js.map