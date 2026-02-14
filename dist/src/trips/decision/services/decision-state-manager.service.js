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
var DecisionStateManagerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionStateManagerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let DecisionStateManagerService = DecisionStateManagerService_1 = class DecisionStateManagerService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(DecisionStateManagerService_1.name);
    }
    async getDecisionState(tripId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            select: { id: true, metadata: true },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`Trip ${tripId} not found`);
        }
        const metadata = trip.metadata || {};
        const decisionState = metadata.decisionState;
        if (decisionState) {
            return this.normalizeDecisionState(decisionState, tripId);
        }
        return this.createInitialDecisionState(tripId);
    }
    async checkDecisionCompleted(tripId) {
        const state = await this.getDecisionState(tripId);
        return state.decisionCompleted;
    }
    async updateDecisionState(tripId, update) {
        const currentState = await this.getDecisionState(tripId);
        let newState = { ...currentState };
        if (update.step) {
            newState.completedSteps[update.step] = true;
        }
        if (update.stage) {
            newState.currentStage = update.stage;
        }
        if (update.decisionCompleted !== undefined) {
            newState.decisionCompleted = update.decisionCompleted;
            if (update.decisionCompleted) {
                newState.decisionCompletedAt = new Date();
                newState.featuresDisabled = {
                    booking: false,
                    purchase: false,
                    execution: false,
                };
            }
        }
        newState.decisionCompletionPercentage = this.calculateCompletionPercentage(newState.completedSteps);
        if (newState.decisionCompletionPercentage === 100 &&
            !newState.decisionCompleted) {
            newState.decisionCompleted = true;
            newState.decisionCompletedAt = new Date();
            newState.featuresDisabled = {
                booking: false,
                purchase: false,
                execution: false,
            };
        }
        if (update.metadata) {
            newState.metadata = {
                ...newState.metadata,
                ...update.metadata,
            };
        }
        newState.updatedAt = new Date();
        await this.saveDecisionState(tripId, newState);
        this.logger.log(`Decision state updated for trip ${tripId}: ${newState.decisionCompletionPercentage}% complete`);
        return newState;
    }
    async updateDecisionProgress(tripId, step) {
        return this.updateDecisionState(tripId, { step });
    }
    async disablePreDecisionFeatures(tripId) {
        const state = await this.getDecisionState(tripId);
        state.featuresDisabled = {
            booking: true,
            purchase: true,
            execution: true,
        };
        return this.saveDecisionState(tripId, state);
    }
    async enableExecutionFeatures(tripId) {
        return this.updateDecisionState(tripId, {
            decisionCompleted: true,
        });
    }
    async isFeatureEnabled(tripId, feature) {
        const state = await this.getDecisionState(tripId);
        return !state.featuresDisabled[feature];
    }
    async validateFeatureAccess(tripId, feature) {
        const isEnabled = await this.isFeatureEnabled(tripId, feature);
        if (!isEnabled) {
            const state = await this.getDecisionState(tripId);
            throw new Error(`功能 ${feature} 已被禁用。决策完成度：${state.decisionCompletionPercentage}%。请先完成决策流程。`);
        }
    }
    createInitialDecisionState(tripId) {
        const userId = this.extractUserIdFromTripId(tripId);
        return {
            tripId,
            userId: userId || 'unknown',
            decisionCompleted: false,
            decisionCompletionPercentage: 0,
            currentStage: 'INTENTION',
            completedSteps: {
                routeSelection: false,
                rhythmSelection: false,
                riskAcknowledgment: false,
                finalConfirmation: false,
            },
            featuresDisabled: {
                booking: true,
                purchase: true,
                execution: true,
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }
    normalizeDecisionState(state, tripId) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        const userId = state.userId || this.extractUserIdFromTripId(tripId) || 'unknown';
        return {
            tripId,
            userId,
            decisionCompleted: state.decisionCompleted || false,
            decisionCompletedAt: state.decisionCompletedAt,
            decisionCompletionPercentage: (_a = state.decisionCompletionPercentage) !== null && _a !== void 0 ? _a : 0,
            currentStage: state.currentStage || 'INTENTION',
            completedSteps: {
                routeSelection: ((_b = state.completedSteps) === null || _b === void 0 ? void 0 : _b.routeSelection) || false,
                rhythmSelection: ((_c = state.completedSteps) === null || _c === void 0 ? void 0 : _c.rhythmSelection) || false,
                riskAcknowledgment: ((_d = state.completedSteps) === null || _d === void 0 ? void 0 : _d.riskAcknowledgment) || false,
                finalConfirmation: ((_e = state.completedSteps) === null || _e === void 0 ? void 0 : _e.finalConfirmation) || false,
            },
            featuresDisabled: {
                booking: (_g = (_f = state.featuresDisabled) === null || _f === void 0 ? void 0 : _f.booking) !== null && _g !== void 0 ? _g : true,
                purchase: (_j = (_h = state.featuresDisabled) === null || _h === void 0 ? void 0 : _h.purchase) !== null && _j !== void 0 ? _j : true,
                execution: (_l = (_k = state.featuresDisabled) === null || _k === void 0 ? void 0 : _k.execution) !== null && _l !== void 0 ? _l : true,
            },
            createdAt: state.createdAt || new Date(),
            updatedAt: state.updatedAt || new Date(),
            metadata: state.metadata,
        };
    }
    calculateCompletionPercentage(steps) {
        const completedCount = Object.values(steps).filter(Boolean).length;
        const totalSteps = Object.keys(steps).length;
        return Math.round((completedCount / totalSteps) * 100);
    }
    async saveDecisionState(tripId, state) {
        var _a;
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            select: { metadata: true },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`Trip ${tripId} not found`);
        }
        const metadata = trip.metadata || {};
        metadata.decisionState = {
            ...state,
            decisionCompletedAt: (_a = state.decisionCompletedAt) === null || _a === void 0 ? void 0 : _a.toISOString(),
            createdAt: state.createdAt.toISOString(),
            updatedAt: state.updatedAt.toISOString(),
        };
        await this.prisma.trip.update({
            where: { id: tripId },
            data: { metadata },
        });
        return state;
    }
    extractUserIdFromTripId(tripId) {
        return null;
    }
};
exports.DecisionStateManagerService = DecisionStateManagerService;
exports.DecisionStateManagerService = DecisionStateManagerService = DecisionStateManagerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DecisionStateManagerService);
//# sourceMappingURL=decision-state-manager.service.js.map