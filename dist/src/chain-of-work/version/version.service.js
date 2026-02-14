"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var VersionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.VersionService = void 0;
const common_1 = require("@nestjs/common");
let VersionService = VersionService_1 = class VersionService {
    constructor() {
        this.logger = new common_1.Logger(VersionService_1.name);
        this.versions = new Map();
    }
    async saveVersion(workflowId, draft, metadata) {
        this.logger.log(`[VersionService] 保存版本: workflow_id=${workflowId}, version=${draft.version}`);
        const version = {
            id: this.generateUuid(),
            workflow_id: workflowId,
            version: draft.version,
            draft_data: draft,
            status: 'draft',
            is_current: false,
            creator: (metadata === null || metadata === void 0 ? void 0 : metadata.creator) || 'system',
            description: metadata === null || metadata === void 0 ? void 0 : metadata.description,
            created_at: new Date().toISOString(),
        };
        const versions = this.versions.get(workflowId) || [];
        versions.push(version);
        this.versions.set(workflowId, versions);
        return version;
    }
    async getVersionList(workflowId) {
        return this.versions.get(workflowId) || [];
    }
    async getVersion(workflowId, versionId) {
        const versions = this.versions.get(workflowId) || [];
        return versions.find(v => v.id === versionId) || null;
    }
    async rollbackToVersion(workflowId, versionId) {
        const version = await this.getVersion(workflowId, versionId);
        if (!version) {
            throw new Error(`版本不存在: ${versionId}`);
        }
        const versions = this.versions.get(workflowId) || [];
        versions.forEach(v => {
            v.is_current = v.id === versionId;
        });
        return version;
    }
    generateUuid() {
        return `v${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
};
exports.VersionService = VersionService;
exports.VersionService = VersionService = VersionService_1 = __decorate([
    (0, common_1.Injectable)()
], VersionService);
//# sourceMappingURL=version.service.js.map