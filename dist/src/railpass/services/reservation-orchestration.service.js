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
var ReservationOrchestrationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReservationOrchestrationService = void 0;
const common_1 = require("@nestjs/common");
const reservation_decision_engine_service_1 = require("./reservation-decision-engine.service");
let ReservationOrchestrationService = ReservationOrchestrationService_1 = class ReservationOrchestrationService {
    constructor(reservationEngine) {
        this.reservationEngine = reservationEngine;
        this.logger = new common_1.Logger(ReservationOrchestrationService_1.name);
    }
    planReservations(input) {
        var _a;
        const { segments, userPreferences } = input;
        const reservationTasks = [];
        const violations = [];
        const allFallbackOptions = [];
        let totalFeeMin = 0;
        let totalFeeMax = 0;
        let maxRisk = 'LOW';
        for (const segment of segments) {
            const requirement = this.reservationEngine.checkReservation(segment);
            const task = {
                taskId: `task_${segment.segmentId}_${Date.now()}`,
                segmentId: segment.segmentId,
                status: requirement.required ? 'NEEDED' : 'PLANNED',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                travelDay: segment.departureDate,
            };
            reservationTasks.push(task);
            if (requirement.required) {
                if (userPreferences === null || userPreferences === void 0 ? void 0 : userPreferences.maxReservationFee) {
                    const segmentFeeMax = ((_a = requirement.feeEstimate) === null || _a === void 0 ? void 0 : _a.max) || 0;
                    if (segmentFeeMax > userPreferences.maxReservationFee) {
                        violations.push({
                            code: 'RESERVATION_FEE_OVER_BUDGET',
                            severity: 'warning',
                            message: `Segment ${segment.segmentId} 订座费用预估超过预算`,
                            segmentId: segment.segmentId,
                            details: {
                                estimatedMax: segmentFeeMax,
                                budget: userPreferences.maxReservationFee,
                            },
                        });
                    }
                }
                if (requirement.feeEstimate) {
                    totalFeeMin += requirement.feeEstimate.min;
                    totalFeeMax += requirement.feeEstimate.max;
                }
                if (requirement.quotaRisk === 'HIGH') {
                    maxRisk = 'HIGH';
                }
                else if (requirement.quotaRisk === 'MEDIUM' && maxRisk !== 'HIGH') {
                    maxRisk = 'MEDIUM';
                }
                const fallbackOptions = this.reservationEngine.generateFallbackOptions(segment);
                allFallbackOptions.push(...fallbackOptions);
            }
        }
        return {
            reservationTasks,
            violations,
            fallbackOptions: allFallbackOptions,
            totalFeeEstimate: totalFeeMax > 0 ? {
                min: totalFeeMin,
                max: totalFeeMax,
                currency: 'EUR',
            } : undefined,
            overallRisk: maxRisk,
        };
    }
    updateTaskStatus(taskId, status, updates) {
        return {
            taskId,
            segmentId: '',
            status,
            bookingRef: updates === null || updates === void 0 ? void 0 : updates.bookingRef,
            cost: updates === null || updates === void 0 ? void 0 : updates.cost,
            failReason: updates === null || updates === void 0 ? void 0 : updates.failReason,
            fallbackPlanId: updates === null || updates === void 0 ? void 0 : updates.fallbackPlanId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
    }
    getTasksByStatus(tasks, status) {
        if (!status) {
            return tasks;
        }
        return tasks.filter(task => task.status === status);
    }
    getPendingTasks(tasks) {
        return tasks.filter(task => task.status === 'NEEDED' || task.status === 'PLANNED');
    }
    applyFallback(taskId, fallbackOption) {
        const updatedTask = this.updateTaskStatus(taskId, 'FALLBACK_APPLIED', {
            fallbackPlanId: fallbackOption.optionId,
        });
        return {
            success: true,
            newTask: updatedTask,
            message: `已应用备用方案：${fallbackOption.description}`,
        };
    }
};
exports.ReservationOrchestrationService = ReservationOrchestrationService;
exports.ReservationOrchestrationService = ReservationOrchestrationService = ReservationOrchestrationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [reservation_decision_engine_service_1.ReservationDecisionEngineService])
], ReservationOrchestrationService);
//# sourceMappingURL=reservation-orchestration.service.js.map