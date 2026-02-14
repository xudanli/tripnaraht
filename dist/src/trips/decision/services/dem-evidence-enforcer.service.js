"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DemEvidenceEnforcerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DemEvidenceEnforcerService = void 0;
const common_1 = require("@nestjs/common");
let DemEvidenceEnforcerService = DemEvidenceEnforcerService_1 = class DemEvidenceEnforcerService {
    constructor() {
        this.logger = new common_1.Logger(DemEvidenceEnforcerService_1.name);
    }
    canFinalizePlan(evidenceResult) {
        if (evidenceResult.segmentEvidences.length === 0) {
            return {
                allowed: false,
                reason: '计划缺少 DEM 证据，无法验证地形约束，不能 finalize',
            };
        }
        if (evidenceResult.hasHardViolation) {
            return {
                allowed: false,
                reason: '计划存在硬约束违规，必须修复后才能 finalize',
            };
        }
        return { allowed: true };
    }
    canNeptuneRepairSegment(segmentId, evidenceResult) {
        const evidence = evidenceResult.segmentEvidences.find(e => e.segmentId === segmentId);
        if (!evidence) {
            return {
                allowed: false,
                reason: `Segment ${segmentId} 没有 DEM 证据，Neptune 不允许修复`,
            };
        }
        return {
            allowed: true,
            evidence,
        };
    }
    canAbuIgnoreViolation(segmentId, evidenceResult) {
        const evidence = evidenceResult.segmentEvidences.find(e => e.segmentId === segmentId);
        if (!evidence) {
            this.logger.warn(`Segment ${segmentId} 没有 DEM 证据，Abu 无法判断是否可以忽略`);
            return {
                allowed: false,
                reason: `Segment ${segmentId} 没有 DEM 证据`,
            };
        }
        if (evidence.violation === 'HARD') {
            return {
                allowed: false,
                reason: `Segment ${segmentId} 存在 HARD violation，Abu 不允许忽略`,
                evidence,
            };
        }
        return {
            allowed: true,
            evidence,
        };
    }
    getSegmentsRequiringRepair(evidenceResult) {
        return evidenceResult.segmentEvidences.filter(e => e.violation === 'HARD');
    }
    getSegmentsSuggestingOptimization(evidenceResult) {
        return evidenceResult.segmentEvidences.filter(e => e.violation === 'SOFT');
    }
};
exports.DemEvidenceEnforcerService = DemEvidenceEnforcerService;
exports.DemEvidenceEnforcerService = DemEvidenceEnforcerService = DemEvidenceEnforcerService_1 = __decorate([
    (0, common_1.Injectable)()
], DemEvidenceEnforcerService);
//# sourceMappingURL=dem-evidence-enforcer.service.js.map