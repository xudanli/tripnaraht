"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChainOfWorkModule = void 0;
const common_1 = require("@nestjs/common");
const chain_of_work_controller_1 = require("./controllers/chain-of-work.controller");
const chain_of_work_admin_controller_1 = require("./controllers/chain-of-work-admin.controller");
const chain_of_work_service_1 = require("./services/chain-of-work.service");
const chain_of_work_storage_service_1 = require("./storage/chain-of-work-storage.service");
const draft_generator_service_1 = require("./draft/draft-generator.service");
const draft_validator_service_1 = require("./draft/draft-validator.service");
const draft_editor_service_1 = require("./draft/draft-editor.service");
const skill_mapping_service_1 = require("./mapping/skill/skill-mapping.service");
const sub_agent_mapping_service_1 = require("./mapping/sub-agent/sub-agent-mapping.service");
const execution_plan_generator_service_1 = require("./execution/execution-plan-generator.service");
const execution_integration_service_1 = require("./execution/execution-integration.service");
const version_service_1 = require("./version/version.service");
const agent_module_1 = require("../agent/agent.module");
const skills_module_1 = require("../skills/skills.module");
const llm_module_1 = require("../llm/llm.module");
const prisma_module_1 = require("../prisma/prisma.module");
let ChainOfWorkModule = class ChainOfWorkModule {
};
exports.ChainOfWorkModule = ChainOfWorkModule;
exports.ChainOfWorkModule = ChainOfWorkModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            (0, common_1.forwardRef)(() => agent_module_1.AgentModule),
            (0, common_1.forwardRef)(() => skills_module_1.SkillsModule),
            llm_module_1.LlmModule,
        ],
        controllers: [chain_of_work_controller_1.ChainOfWorkController, chain_of_work_admin_controller_1.ChainOfWorkAdminController],
        providers: [
            chain_of_work_service_1.ChainOfWorkService,
            chain_of_work_storage_service_1.ChainOfWorkStorageService,
            draft_generator_service_1.DraftGeneratorService,
            draft_validator_service_1.DraftValidatorService,
            draft_editor_service_1.DraftEditorService,
            skill_mapping_service_1.SkillMappingService,
            sub_agent_mapping_service_1.SubAgentMappingService,
            execution_plan_generator_service_1.ExecutionPlanGeneratorService,
            execution_integration_service_1.ExecutionIntegrationService,
            version_service_1.VersionService,
        ],
        exports: [
            chain_of_work_service_1.ChainOfWorkService,
            chain_of_work_storage_service_1.ChainOfWorkStorageService,
            draft_generator_service_1.DraftGeneratorService,
            skill_mapping_service_1.SkillMappingService,
            sub_agent_mapping_service_1.SubAgentMappingService,
            version_service_1.VersionService,
        ],
    })
], ChainOfWorkModule);
//# sourceMappingURL=chain-of-work.module.js.map