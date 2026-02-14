"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DestinationClarificationModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_module_1 = require("../../prisma/prisma.module");
const llm_module_1 = require("../../llm/llm.module");
const destination_clarification_config_service_1 = require("./services/destination-clarification-config.service");
const gate_precheck_service_1 = require("./services/gate-precheck.service");
const ai_decision_logic_service_1 = require("./services/ai-decision-logic.service");
const destination_clarification_controller_1 = require("./destination-clarification.controller");
let DestinationClarificationModule = class DestinationClarificationModule {
};
exports.DestinationClarificationModule = DestinationClarificationModule;
exports.DestinationClarificationModule = DestinationClarificationModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, llm_module_1.LlmModule],
        providers: [
            destination_clarification_config_service_1.DestinationClarificationConfigService,
            gate_precheck_service_1.GatePrecheckService,
            ai_decision_logic_service_1.AiDecisionLogicService,
        ],
        controllers: [destination_clarification_controller_1.DestinationClarificationController],
        exports: [
            destination_clarification_config_service_1.DestinationClarificationConfigService,
            gate_precheck_service_1.GatePrecheckService,
            ai_decision_logic_service_1.AiDecisionLogicService,
        ],
    })
], DestinationClarificationModule);
//# sourceMappingURL=destination-clarification.module.js.map