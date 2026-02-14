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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ChainOfWorkController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChainOfWorkController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const chain_of_work_service_1 = require("../services/chain-of-work.service");
const version_service_1 = require("../version/version.service");
const chain_of_work_dto_1 = require("../dto/chain-of-work.dto");
const public_decorator_1 = require("../../auth/decorators/public.decorator");
let ChainOfWorkController = ChainOfWorkController_1 = class ChainOfWorkController {
    constructor(chainOfWorkService, versionService) {
        this.chainOfWorkService = chainOfWorkService;
        this.versionService = versionService;
        this.logger = new common_1.Logger(ChainOfWorkController_1.name);
    }
    async generateDraft(dto) {
        const startTime = Date.now();
        const draft = await this.chainOfWorkService.generateDraft(dto.trip_plan_request, dto.config);
        const generationTime = Date.now() - startTime;
        return {
            draft,
            generation_time_ms: generationTime,
        };
    }
    async saveDraft(dto) {
        const version = await this.versionService.saveVersion(dto.draft.workflow_id, dto.draft, {
            creator: 'user',
            description: dto.is_auto_save ? '自动保存' : '手动保存',
        });
        return {
            draft_id: dto.draft.draft_id,
            version: version.version,
            saved_at: version.created_at,
        };
    }
    async getDraft(draftId) {
        throw new Error('Not implemented');
    }
    async executeDraft(draftId, dto) {
        throw new Error('Not implemented');
    }
    async getVersionList(workflowId, page, pageSize) {
        const versions = await this.versionService.getVersionList(workflowId);
        const pagedVersions = versions.slice(((page || 1) - 1) * (pageSize || 20), (page || 1) * (pageSize || 20));
        return {
            versions: pagedVersions,
            total: versions.length,
            page: page || 1,
            page_size: pageSize || 20,
        };
    }
    async rollbackVersion(workflowId, dto) {
        if (!dto.confirm) {
            throw new Error('需要确认才能回滚');
        }
        const version = await this.versionService.rollbackToVersion(workflowId, dto.version_id);
        return {
            success: true,
            new_version: version.version,
            rolled_back_at: new Date().toISOString(),
        };
    }
};
exports.ChainOfWorkController = ChainOfWorkController;
__decorate([
    (0, common_1.Post)('draft/generate'),
    (0, swagger_1.ApiOperation)({ summary: '生成步骤草案', description: '根据用户旅行需求，生成符合 CLAUDE_SM 状态机流程的步骤草案' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: '步骤草案生成成功' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: '未授权（需要登录）' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [chain_of_work_dto_1.GenerateDraftDto]),
    __metadata("design:returntype", Promise)
], ChainOfWorkController.prototype, "generateDraft", null);
__decorate([
    (0, common_1.Post)('draft/save'),
    (0, swagger_1.ApiOperation)({ summary: '保存步骤草案' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '步骤草案保存成功' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [chain_of_work_dto_1.SaveDraftDto]),
    __metadata("design:returntype", Promise)
], ChainOfWorkController.prototype, "saveDraft", null);
__decorate([
    (0, common_1.Get)('draft/:draftId'),
    (0, swagger_1.ApiOperation)({ summary: '查询步骤草案' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '步骤草案查询成功' }),
    __param(0, (0, common_1.Param)('draftId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ChainOfWorkController.prototype, "getDraft", null);
__decorate([
    (0, common_1.Post)('draft/:draftId/execute'),
    (0, swagger_1.ApiOperation)({ summary: '执行步骤草案' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '执行成功' }),
    __param(0, (0, common_1.Param)('draftId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, chain_of_work_dto_1.ExecuteDraftDto]),
    __metadata("design:returntype", Promise)
], ChainOfWorkController.prototype, "executeDraft", null);
__decorate([
    (0, common_1.Get)('version/:workflowId'),
    (0, swagger_1.ApiOperation)({ summary: '查询版本列表' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '版本列表查询成功' }),
    __param(0, (0, common_1.Param)('workflowId')),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('page_size')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Number]),
    __metadata("design:returntype", Promise)
], ChainOfWorkController.prototype, "getVersionList", null);
__decorate([
    (0, common_1.Post)('version/:workflowId/rollback'),
    (0, swagger_1.ApiOperation)({ summary: '回滚到指定版本' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '回滚成功' }),
    __param(0, (0, common_1.Param)('workflowId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, chain_of_work_dto_1.RollbackVersionDto]),
    __metadata("design:returntype", Promise)
], ChainOfWorkController.prototype, "rollbackVersion", null);
exports.ChainOfWorkController = ChainOfWorkController = ChainOfWorkController_1 = __decorate([
    (0, swagger_1.ApiTags)('Chain-of-Work'),
    (0, common_1.Controller)('chain-of-work'),
    (0, public_decorator_1.Public)(),
    __metadata("design:paramtypes", [chain_of_work_service_1.ChainOfWorkService,
        version_service_1.VersionService])
], ChainOfWorkController);
//# sourceMappingURL=chain-of-work.controller.js.map