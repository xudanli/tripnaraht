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
var ScheduleActionIntegrationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScheduleActionIntegrationService = void 0;
const common_1 = require("@nestjs/common");
const compliance_validator_service_1 = require("../services/compliance-validator.service");
const reservation_orchestration_service_1 = require("../services/reservation-orchestration.service");
const reservation_decision_engine_service_1 = require("../services/reservation-decision-engine.service");
const railpass_constraints_service_1 = require("../constraints/railpass-constraints.service");
let ScheduleActionIntegrationService = ScheduleActionIntegrationService_1 = class ScheduleActionIntegrationService {
    constructor(complianceValidator, reservationOrchestrator, reservationEngine, constraintsService) {
        this.complianceValidator = complianceValidator;
        this.reservationOrchestrator = reservationOrchestrator;
        this.reservationEngine = reservationEngine;
        this.constraintsService = constraintsService;
        this.logger = new common_1.Logger(ScheduleActionIntegrationService_1.name);
    }
    async revalidateReservationFeasibility(args) {
        const { passProfile, oldSegments, newSegments, oldReservationTasks } = args;
        const changes = this.detectSegmentChanges(oldSegments, newSegments);
        const needsRevalidation = changes.hasChanges;
        if (!needsRevalidation) {
            return {
                needsRevalidation: false,
                valid: true,
                newViolations: [],
                affectedTasks: [],
                recommendedActions: [],
            };
        }
        const newReservationPlan = this.reservationOrchestrator.planReservations({
            segments: newSegments,
        });
        const complianceResult = await this.complianceValidator.validateCompliance({
            passProfile,
            segments: newSegments,
            reservationTasks: newReservationPlan.reservationTasks,
        });
        const constraintViolations = this.constraintsService.checkAllConstraints({
            passProfile,
            segments: newSegments,
            reservationTasks: newReservationPlan.reservationTasks,
        });
        const affectedTasks = this.identifyAffectedTasks(oldReservationTasks, newReservationPlan.reservationTasks, changes);
        const allViolations = [
            ...complianceResult.violations
                .filter(v => v.severity === 'error' || v.severity === 'warning')
                .map(v => ({
                code: v.code,
                severity: v.severity,
                message: v.message,
                segmentId: v.segmentId,
            })),
            ...constraintViolations
                .filter(v => v.severity === 'error' || v.severity === 'warning')
                .map(v => ({
                code: v.code,
                severity: v.severity,
                message: v.message,
                segmentId: v.slotId,
            })),
        ];
        const recommendedActions = this.generateRecommendations(complianceResult, constraintViolations, affectedTasks, changes);
        return {
            needsRevalidation: true,
            valid: complianceResult.valid && constraintViolations.filter(v => v.severity === 'error').length === 0,
            newViolations: allViolations,
            affectedTasks,
            recommendedActions,
        };
    }
    detectSegmentChanges(oldSegments, newSegments) {
        const oldMap = new Map(oldSegments.map(s => [s.segmentId, s]));
        const newMap = new Map(newSegments.map(s => [s.segmentId, s]));
        const added = [];
        const removed = [];
        const modified = [];
        for (const newSeg of newSegments) {
            const oldSeg = oldMap.get(newSeg.segmentId);
            if (!oldSeg) {
                added.push(newSeg);
            }
            else if (this.isSegmentModified(oldSeg, newSeg)) {
                modified.push({ old: oldSeg, new: newSeg });
            }
        }
        for (const oldSeg of oldSegments) {
            if (!newMap.has(oldSeg.segmentId)) {
                removed.push(oldSeg);
            }
        }
        return {
            hasChanges: added.length > 0 || removed.length > 0 || modified.length > 0,
            added,
            removed,
            modified,
        };
    }
    isSegmentModified(oldSeg, newSeg) {
        var _a, _b;
        return (oldSeg.departureDate !== newSeg.departureDate ||
            ((_a = oldSeg.departureTimeWindow) === null || _a === void 0 ? void 0 : _a.earliest) !== ((_b = newSeg.departureTimeWindow) === null || _b === void 0 ? void 0 : _b.earliest) ||
            oldSeg.fromPlaceId !== newSeg.fromPlaceId ||
            oldSeg.toPlaceId !== newSeg.toPlaceId ||
            oldSeg.isNightTrain !== newSeg.isNightTrain ||
            oldSeg.isHighSpeed !== newSeg.isHighSpeed);
    }
    identifyAffectedTasks(oldTasks, newTasks, changes) {
        const affected = [];
        for (const removedSeg of changes.removed) {
            const oldTask = oldTasks.find(t => t.segmentId === removedSeg.segmentId);
            if (oldTask) {
                affected.push({
                    taskId: oldTask.taskId,
                    segmentId: removedSeg.segmentId,
                    oldStatus: oldTask.status,
                    newStatus: 'CANCELLED',
                    reason: '段已从行程中移除',
                });
            }
        }
        for (const mod of changes.modified) {
            const oldTask = oldTasks.find(t => t.segmentId === mod.old.segmentId);
            const newTask = newTasks.find(t => t.segmentId === mod.new.segmentId);
            if (oldTask && newTask && oldTask.status !== newTask.status) {
                affected.push({
                    taskId: oldTask.taskId,
                    segmentId: mod.old.segmentId,
                    oldStatus: oldTask.status,
                    newStatus: newTask.status,
                    reason: '段信息已变更，需要重新评估订座需求',
                });
            }
        }
        for (const addedSeg of changes.added) {
            const newTask = newTasks.find(t => t.segmentId === addedSeg.segmentId);
            if (newTask) {
                affected.push({
                    taskId: newTask.taskId,
                    segmentId: addedSeg.segmentId,
                    oldStatus: 'N/A',
                    newStatus: newTask.status,
                    reason: '新增段，需要订座',
                });
            }
        }
        return affected;
    }
    generateRecommendations(complianceResult, constraintViolations, affectedTasks, changes) {
        const recommendations = [];
        if (changes.added.length > 0) {
            const needReservationCount = affectedTasks.filter(t => t.newStatus === 'NEEDED' || t.newStatus === 'PLANNED').length;
            if (needReservationCount > 0) {
                recommendations.push(`新增了 ${needReservationCount} 个需要订座的段，建议尽快订座`);
            }
        }
        const mandatoryViolations = constraintViolations.filter(v => v.code === 'RAILPASS_RESERVATION_MANDATORY');
        if (mandatoryViolations.length > 0) {
            recommendations.push(`有 ${mandatoryViolations.length} 个段必须订座但尚未订座，建议立即订座或选择替代路线`);
        }
        const travelDayViolations = constraintViolations.filter(v => v.code === 'RAILPASS_TRAVEL_DAY_BUDGET_EXCEEDED');
        if (travelDayViolations.length > 0) {
            recommendations.push('Travel Days 已超限，建议减少 rail segments 或升级 Pass');
        }
        if (changes.modified.length > 0) {
            recommendations.push(`${changes.modified.length} 个段已修改，请确认原有订座是否仍然有效`);
        }
        return recommendations;
    }
};
exports.ScheduleActionIntegrationService = ScheduleActionIntegrationService;
exports.ScheduleActionIntegrationService = ScheduleActionIntegrationService = ScheduleActionIntegrationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [compliance_validator_service_1.ComplianceValidatorService,
        reservation_orchestration_service_1.ReservationOrchestrationService,
        reservation_decision_engine_service_1.ReservationDecisionEngineService,
        railpass_constraints_service_1.RailPassConstraintsService])
], ScheduleActionIntegrationService);
//# sourceMappingURL=schedule-action-integration.service.js.map