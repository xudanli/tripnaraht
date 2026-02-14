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
var TripEmergencyService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripEmergencyService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const crypto_1 = require("crypto");
let TripEmergencyService = TripEmergencyService_1 = class TripEmergencyService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(TripEmergencyService_1.name);
    }
    async sendSOS(request) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: request.tripId },
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
            throw new common_1.NotFoundException(`行程 ${request.tripId} 不存在`);
        }
        const sosId = (0, crypto_1.randomUUID)();
        const sentAt = request.timestamp || new Date();
        const tripContext = {
            destination: trip.destination,
            startDate: trip.startDate,
            endDate: trip.endDate,
            currentDate: sentAt,
            itinerary: trip.TripDay.flatMap(day => day.ItineraryItem.map(item => ({
                date: day.date,
                place: item.Place ? {
                    name: item.Place.nameCN || item.Place.nameEN,
                    address: item.Place.address,
                    coordinates: undefined,
                } : null,
            }))),
        };
        this.logger.log(`发送紧急求救信号: SOS ID=${sosId}, Trip ID=${request.tripId}, 坐标=(${request.latitude}, ${request.longitude})`);
        const emergencyRecord = {
            sosId,
            coordinates: {
                latitude: request.latitude,
                longitude: request.longitude,
            },
            message: request.message,
            sentAt: sentAt.toISOString(),
            status: 'SENT',
            tripContext,
        };
        const currentMetadata = trip.metadata || {};
        const emergencyHistory = currentMetadata.emergencyHistory || [];
        emergencyHistory.push(emergencyRecord);
        await this.prisma.trip.update({
            where: { id: request.tripId },
            data: {
                metadata: {
                    ...currentMetadata,
                    emergencyHistory,
                    lastEmergencySOS: emergencyRecord,
                },
            },
        });
        return {
            sosId,
            tripId: request.tripId,
            status: 'SENT',
            coordinates: {
                latitude: request.latitude,
                longitude: request.longitude,
            },
            sentAt,
        };
    }
    async getSOSHistory(tripId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ${tripId} 不存在`);
        }
        const metadata = trip.metadata || {};
        const emergencyHistory = metadata.emergencyHistory || [];
        return emergencyHistory.map((record) => ({
            sosId: record.sosId,
            tripId,
            status: record.status || 'SENT',
            coordinates: record.coordinates,
            sentAt: new Date(record.sentAt),
            rescueInfo: record.rescueInfo,
        }));
    }
    async updateRescueProgress(sosId, progress) {
        const trips = await this.prisma.trip.findMany({
            where: {
                metadata: {
                    path: ['lastEmergencySOS', 'sosId'],
                    equals: sosId,
                },
            },
        });
        if (trips.length === 0) {
            throw new common_1.NotFoundException(`未找到 SOS ID ${sosId} 对应的行程`);
        }
        const trip = trips[0];
        const metadata = trip.metadata || {};
        const emergencyHistory = metadata.emergencyHistory || [];
        const updatedHistory = emergencyHistory.map((record) => {
            if (record.sosId === sosId) {
                return {
                    ...record,
                    status: progress.status,
                    rescueInfo: {
                        estimatedArrival: progress.estimatedArrival,
                        contactNumber: progress.contactNumber,
                        progress: progress.progress,
                    },
                };
            }
            return record;
        });
        const lastEmergency = updatedHistory[updatedHistory.length - 1];
        if (lastEmergency && lastEmergency.sosId === sosId) {
            metadata.lastEmergencySOS = {
                ...lastEmergency,
                status: progress.status,
                rescueInfo: {
                    estimatedArrival: progress.estimatedArrival,
                    contactNumber: progress.contactNumber,
                    progress: progress.progress,
                },
            };
        }
        await this.prisma.trip.update({
            where: { id: trip.id },
            data: {
                metadata: {
                    ...metadata,
                    emergencyHistory: updatedHistory,
                    lastEmergencySOS: metadata.lastEmergencySOS,
                },
            },
        });
        this.logger.log(`更新救援进度: SOS ID=${sosId}, Status=${progress.status}`);
    }
};
exports.TripEmergencyService = TripEmergencyService;
exports.TripEmergencyService = TripEmergencyService = TripEmergencyService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TripEmergencyService);
//# sourceMappingURL=trip-emergency.service.js.map