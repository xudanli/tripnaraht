"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DraftEditorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DraftEditorService = void 0;
const common_1 = require("@nestjs/common");
let DraftEditorService = DraftEditorService_1 = class DraftEditorService {
    constructor() {
        this.logger = new common_1.Logger(DraftEditorService_1.name);
    }
    async updateStep(draft, stepId, updates) {
        this.logger.debug(`[DraftEditor] 编辑步骤: draft_id=${draft.draft_id}, step_id=${stepId}`);
        const stepIndex = draft.steps.findIndex(s => s.id === stepId);
        if (stepIndex === -1) {
            throw new Error(`步骤不存在: ${stepId}`);
        }
        draft.steps[stepIndex] = {
            ...draft.steps[stepIndex],
            ...updates,
            status: 'modified',
            updated_at: new Date().toISOString(),
            version: draft.steps[stepIndex].version + 1,
        };
        draft.updated_at = new Date().toISOString();
        draft.metadata.last_modified = new Date().toISOString();
        return draft;
    }
    async addStep(draft, step, position) {
        this.logger.debug(`[DraftEditor] 添加步骤: draft_id=${draft.draft_id}, position=${position}`);
        if (position !== undefined) {
            draft.steps.splice(position, 0, step);
        }
        else {
            draft.steps.push(step);
        }
        draft.metadata.step_count = draft.steps.length;
        draft.updated_at = new Date().toISOString();
        draft.metadata.last_modified = new Date().toISOString();
        return draft;
    }
    async deleteStep(draft, stepId) {
        this.logger.debug(`[DraftEditor] 删除步骤: draft_id=${draft.draft_id}, step_id=${stepId}`);
        draft.steps = draft.steps.filter(s => s.id !== stepId);
        draft.metadata.step_count = draft.steps.length;
        draft.updated_at = new Date().toISOString();
        draft.metadata.last_modified = new Date().toISOString();
        return draft;
    }
};
exports.DraftEditorService = DraftEditorService;
exports.DraftEditorService = DraftEditorService = DraftEditorService_1 = __decorate([
    (0, common_1.Injectable)()
], DraftEditorService);
//# sourceMappingURL=draft-editor.service.js.map