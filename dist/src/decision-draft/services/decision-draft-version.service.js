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
var DecisionDraftVersionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionDraftVersionService = void 0;
const common_1 = require("@nestjs/common");
const version_service_1 = require("../../chain-of-work/version/version.service");
const decision_draft_storage_service_1 = require("../storage/decision-draft-storage.service");
let DecisionDraftVersionService = DecisionDraftVersionService_1 = class DecisionDraftVersionService {
    constructor(versionService, storageService) {
        this.versionService = versionService;
        this.storageService = storageService;
        this.logger = new common_1.Logger(DecisionDraftVersionService_1.name);
    }
    async saveVersion(decisionDraft, options) {
        this.logger.log(`[DecisionDraftVersion] 保存决策草案版本: workflow_id=${decisionDraft.workflow_id}`);
        if (!decisionDraft.step_draft) {
            throw new Error('Step Draft 不存在，无法保存版本');
        }
        const stepDraftVersion = await this.versionService.saveVersion(decisionDraft.workflow_id, decisionDraft.step_draft, {
            creator: options.creator,
            description: options.description || '决策草案版本',
        });
        const planVersion = decisionDraft.plan_version || parseInt(decisionDraft.version || '1', 10);
        const planId = decisionDraft.plan_id || decisionDraft.workflow_id;
        const versionString = planVersion.toString();
        const decisionDraftVersion = {
            version_id: stepDraftVersion.id,
            plan_id: planId,
            plan_version: planVersion,
            workflow_id: planId,
            version: versionString,
            decision_draft: decisionDraft,
            step_draft: decisionDraft.step_draft,
            execution_result: decisionDraft.execution_result,
            created_by: options.creator,
            description: options.description,
            created_at: stepDraftVersion.created_at,
        };
        await this.storageService.saveVersion(decisionDraftVersion);
        return decisionDraftVersion;
    }
    async getVersions(workflowId) {
        this.logger.log(`[DecisionDraftVersion] 获取版本列表: workflow_id=${workflowId}`);
        return this.storageService.loadVersions(workflowId);
    }
    async getVersion(workflowId, versionId) {
        this.logger.log(`[DecisionDraftVersion] 获取版本: workflow_id=${workflowId}, version_id=${versionId}`);
        const version = await this.versionService.getVersion(workflowId, versionId);
        if (!version) {
            return null;
        }
        return this.storageService.loadVersion(versionId);
    }
    async compareVersions(workflowId, versionId1, versionId2) {
        this.logger.log(`[DecisionDraftVersion] 对比版本: workflow_id=${workflowId}, version1=${versionId1}, version2=${versionId2}`);
        const version1 = await this.getVersion(workflowId, versionId1);
        const version2 = await this.getVersion(workflowId, versionId2);
        if (!version1 || !version2) {
            throw new Error('版本不存在');
        }
        const diff = this.calculateDiff(version1, version2);
        return {
            version1,
            version2,
            diff,
        };
    }
    calculateDiff(version1, version2) {
        const decisionSteps1 = version1.decision_draft.decision_steps;
        const decisionSteps2 = version2.decision_draft.decision_steps;
        const stepIds1 = new Set(decisionSteps1.map((s) => s.id));
        const stepIds2 = new Set(decisionSteps2.map((s) => s.id));
        const added = decisionSteps2.filter((s) => !stepIds1.has(s.id));
        const removed = decisionSteps1.filter((s) => !stepIds2.has(s.id));
        const modified = decisionSteps2.filter((s) => {
            if (!stepIds1.has(s.id)) {
                return false;
            }
            const step1 = decisionSteps1.find((s1) => s1.id === s.id);
            return JSON.stringify(step1) !== JSON.stringify(s);
        });
        const stepDrafts1 = version1.step_draft.steps;
        const stepDrafts2 = version2.step_draft.steps;
        const stepDraftIds1 = new Set(stepDrafts1.map((s) => s.id));
        const stepDraftIds2 = new Set(stepDrafts2.map((s) => s.id));
        const stepDraftsAdded = stepDrafts2.filter((s) => !stepDraftIds1.has(s.id));
        const stepDraftsRemoved = stepDrafts1.filter((s) => !stepDraftIds2.has(s.id));
        const stepDraftsModified = stepDrafts2.filter((s) => {
            if (!stepDraftIds1.has(s.id)) {
                return false;
            }
            const step1 = stepDrafts1.find((s1) => s1.id === s.id);
            return JSON.stringify(step1) !== JSON.stringify(s);
        });
        return {
            decision_steps_added: added,
            decision_steps_removed: removed,
            decision_steps_modified: modified,
            step_drafts_added: stepDraftsAdded,
            step_drafts_removed: stepDraftsRemoved,
            step_drafts_modified: stepDraftsModified,
        };
    }
    async rollbackToVersion(workflowId, versionId) {
        this.logger.log(`[DecisionDraftVersion] 回滚到版本: workflow_id=${workflowId}, version_id=${versionId}`);
        const targetVersion = await this.getVersion(workflowId, versionId);
        if (!targetVersion) {
            throw new Error(`版本不存在: ${versionId}`);
        }
        await this.versionService.rollbackToVersion(workflowId, versionId);
        const rolledBackVersion = await this.saveVersion(targetVersion.decision_draft, {
            creator: 'system',
            description: `回滚到版本 ${targetVersion.version}`,
        });
        return rolledBackVersion;
    }
    async forkVersion(workflowId, versionId, newWorkflowId, options) {
        this.logger.log(`[DecisionDraftVersion] Fork 版本: workflow_id=${workflowId}, version_id=${versionId}, new_workflow_id=${newWorkflowId}`);
        const sourceVersion = await this.getVersion(workflowId, versionId);
        if (!sourceVersion) {
            throw new Error(`版本不存在: ${versionId}`);
        }
        const forkedDecisionDraft = {
            ...sourceVersion.decision_draft,
            draft_id: `decision-${newWorkflowId}`,
            workflow_id: newWorkflowId,
            version: 'v1.0',
            metadata: {
                ...sourceVersion.decision_draft.metadata,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            },
        };
        const forkedStepDraft = {
            ...sourceVersion.step_draft,
            draft_id: `step-${newWorkflowId}`,
            workflow_id: newWorkflowId,
            version: 'v1.0',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        forkedDecisionDraft.step_draft = forkedStepDraft;
        const forkedVersion = await this.saveVersion(forkedDecisionDraft, options);
        return forkedVersion;
    }
};
exports.DecisionDraftVersionService = DecisionDraftVersionService;
exports.DecisionDraftVersionService = DecisionDraftVersionService = DecisionDraftVersionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [version_service_1.VersionService,
        decision_draft_storage_service_1.DecisionDraftStorageService])
], DecisionDraftVersionService);
//# sourceMappingURL=decision-draft-version.service.js.map