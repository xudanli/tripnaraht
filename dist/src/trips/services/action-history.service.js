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
exports.ActionHistoryService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const crypto_1 = require("crypto");
let ActionHistoryService = class ActionHistoryService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async recordAction(tripId, dateISO, action, scheduleBefore, scheduleAfter) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new Error(`行程 ID ${tripId} 不存在`);
        }
        const historyId = (0, crypto_1.randomUUID)();
        const historyEntry = {
            id: historyId,
            tripId,
            dateISO,
            actionType: action.type,
            action,
            scheduleBefore,
            scheduleAfter,
            timestamp: new Date(),
        };
        const metadata = trip.metadata || {};
        const actionHistory = metadata.actionHistory || [];
        actionHistory.push(historyEntry);
        const trimmedHistory = actionHistory.slice(-50);
        await this.prisma.trip.update({
            where: { id: tripId },
            data: {
                metadata: {
                    ...metadata,
                    actionHistory: trimmedHistory,
                },
                updatedAt: new Date(),
            },
        });
        return historyId;
    }
    async getActionHistory(tripId, dateISO) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new Error(`行程 ID ${tripId} 不存在`);
        }
        const metadata = trip.metadata || {};
        const actionHistory = metadata.actionHistory || [];
        if (dateISO) {
            return actionHistory.filter(h => h.dateISO === dateISO);
        }
        return actionHistory;
    }
    async undoAction(tripId, dateISO) {
        const history = await this.getActionHistory(tripId, dateISO);
        if (history.length === 0) {
            return null;
        }
        const lastAction = history[history.length - 1];
        return lastAction.scheduleBefore;
    }
    async redoAction(tripId, dateISO) {
        const history = await this.getActionHistory(tripId, dateISO);
        if (history.length === 0) {
            return null;
        }
        const lastAction = history[history.length - 1];
        return lastAction.scheduleAfter;
    }
};
exports.ActionHistoryService = ActionHistoryService;
exports.ActionHistoryService = ActionHistoryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ActionHistoryService);
//# sourceMappingURL=action-history.service.js.map