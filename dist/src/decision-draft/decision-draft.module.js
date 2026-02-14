"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionDraftModule = void 0;
const common_1 = require("@nestjs/common");
const decision_draft_generator_service_1 = require("./services/decision-draft-generator.service");
const decision_draft_editor_service_1 = require("./services/decision-draft-editor.service");
const decision_explanation_service_1 = require("./services/decision-explanation.service");
const decision_draft_version_service_1 = require("./services/decision-draft-version.service");
const decision_draft_storage_service_1 = require("./storage/decision-draft-storage.service");
const decision_draft_observability_service_1 = require("./services/decision-draft-observability.service");
const decision_debug_collector_service_1 = require("./services/decision-debug-collector.service");
const decision_type_to_step_draft_mapper_1 = require("./mapping/decision-type-to-step-draft.mapper");
const decision_draft_controller_1 = require("./controllers/decision-draft.controller");
const studio_mode_guard_1 = require("./guards/studio-mode.guard");
const chain_of_work_module_1 = require("../chain-of-work/chain-of-work.module");
const llm_module_1 = require("../llm/llm.module");
const prisma_module_1 = require("../prisma/prisma.module");
let DecisionDraftModule = class DecisionDraftModule {
};
exports.DecisionDraftModule = DecisionDraftModule;
exports.DecisionDraftModule = DecisionDraftModule = __decorate([
    (0, common_1.Module)({
        imports: [
            (0, common_1.forwardRef)(() => chain_of_work_module_1.ChainOfWorkModule),
            llm_module_1.LlmModule,
            prisma_module_1.PrismaModule,
        ],
        controllers: [decision_draft_controller_1.DecisionDraftController],
        providers: [
            decision_draft_generator_service_1.DecisionDraftGeneratorService,
            decision_draft_editor_service_1.DecisionDraftEditorService,
            decision_explanation_service_1.DecisionExplanationService,
            decision_draft_version_service_1.DecisionDraftVersionService,
            decision_draft_storage_service_1.DecisionDraftStorageService,
            decision_draft_observability_service_1.DecisionDraftObservabilityService,
            decision_debug_collector_service_1.DecisionDebugCollectorService,
            decision_type_to_step_draft_mapper_1.DecisionTypeToStepDraftMapper,
            studio_mode_guard_1.StudioModeGuard,
        ],
        exports: [
            decision_draft_generator_service_1.DecisionDraftGeneratorService,
            decision_draft_editor_service_1.DecisionDraftEditorService,
            decision_explanation_service_1.DecisionExplanationService,
            decision_draft_version_service_1.DecisionDraftVersionService,
            decision_draft_storage_service_1.DecisionDraftStorageService,
            decision_draft_observability_service_1.DecisionDraftObservabilityService,
            decision_debug_collector_service_1.DecisionDebugCollectorService,
            decision_type_to_step_draft_mapper_1.DecisionTypeToStepDraftMapper,
            studio_mode_guard_1.StudioModeGuard,
        ],
    })
], DecisionDraftModule);
//# sourceMappingURL=decision-draft.module.js.map