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
var DiagnosticLabelSystemService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiagnosticLabelSystemService = void 0;
const common_1 = require("@nestjs/common");
let DiagnosticLabelSystemService = DiagnosticLabelSystemService_1 = class DiagnosticLabelSystemService {
    constructor() {
        this.logger = new common_1.Logger(DiagnosticLabelSystemService_1.name);
        this.labels = new Map();
        this.initializeLabels();
    }
    async detectLabels(plan, evidence, decisionLog) {
        this.logger.debug(`[DiagnosticLabelSystem] 检测诊断标签`);
        const detectedLabels = [];
        if (this.checkEvidenceMissing(plan, evidence)) {
            const label = this.labels.get('EVIDENCE_MISSING');
            if (label) {
                detectedLabels.push(label);
            }
        }
        if (this.checkHallucinationRisk(plan, evidence)) {
            const label = this.labels.get('HALLUCINATION_RISK');
            if (label) {
                detectedLabels.push(label);
            }
        }
        if (this.checkExecutability(plan)) {
            const label = this.labels.get('NOT_EXECUTABLE');
            if (label) {
                detectedLabels.push(label);
            }
        }
        if (this.checkSafetyConcern(plan, decisionLog)) {
            const label = this.labels.get('SAFETY_CONCERN');
            if (label) {
                detectedLabels.push(label);
            }
        }
        if (this.checkComplianceIssue(plan, decisionLog)) {
            const label = this.labels.get('COMPLIANCE_ISSUE');
            if (label) {
                detectedLabels.push(label);
            }
        }
        this.logger.debug(`[DiagnosticLabelSystem] 检测到 ${detectedLabels.length} 个诊断标签`);
        return detectedLabels;
    }
    checkEvidenceMissing(plan, evidence) {
        return false;
    }
    checkHallucinationRisk(plan, evidence) {
        return false;
    }
    checkExecutability(plan) {
        return false;
    }
    checkSafetyConcern(plan, decisionLog) {
        return false;
    }
    checkComplianceIssue(plan, decisionLog) {
        return false;
    }
    initializeLabels() {
        this.labels.set('EVIDENCE_MISSING', {
            label_id: 'EVIDENCE_MISSING',
            label_type: 'EVIDENCE_MISSING',
            description: '缺少关键证据',
            detection_criteria: 'plan中的条目缺少evidence_refs',
            impact_on_score: -0.3,
        });
        this.labels.set('HALLUCINATION_RISK', {
            label_id: 'HALLUCINATION_RISK',
            label_type: 'HALLUCINATION_RISK',
            description: '存在幻觉风险',
            detection_criteria: '有未关联证据的声明',
            impact_on_score: -0.5,
        });
        this.labels.set('NOT_EXECUTABLE', {
            label_id: 'NOT_EXECUTABLE',
            label_type: 'NOT_EXECUTABLE',
            description: '规划不可执行',
            detection_criteria: '存在时间冲突、地点不可达等问题',
            impact_on_score: -0.8,
        });
        this.labels.set('SAFETY_CONCERN', {
            label_id: 'SAFETY_CONCERN',
            label_type: 'SAFETY_CONCERN',
            description: '存在安全担忧',
            detection_criteria: '有高风险警告或违反安全约束',
            impact_on_score: -0.6,
        });
        this.labels.set('COMPLIANCE_ISSUE', {
            label_id: 'COMPLIANCE_ISSUE',
            label_type: 'COMPLIANCE_ISSUE',
            description: '存在合规问题',
            detection_criteria: '违反合规约束或法规要求',
            impact_on_score: -0.4,
        });
    }
    getAllLabels() {
        return Array.from(this.labels.values());
    }
};
exports.DiagnosticLabelSystemService = DiagnosticLabelSystemService;
exports.DiagnosticLabelSystemService = DiagnosticLabelSystemService = DiagnosticLabelSystemService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], DiagnosticLabelSystemService);
//# sourceMappingURL=diagnostic-label-system.service.js.map