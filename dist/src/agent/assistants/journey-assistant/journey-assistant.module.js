"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JourneyAssistantModule = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const journey_assistant_service_1 = require("./services/journey-assistant.service");
const journey_assistant_controller_1 = require("./journey-assistant.controller");
const llm_module_1 = require("../../../llm/llm.module");
const prisma_module_1 = require("../../../prisma/prisma.module");
const infra_module_1 = require("../../infra/infra.module");
let JourneyAssistantModule = class JourneyAssistantModule {
};
exports.JourneyAssistantModule = JourneyAssistantModule;
exports.JourneyAssistantModule = JourneyAssistantModule = __decorate([
    (0, common_1.Module)({
        imports: [
            llm_module_1.LlmModule,
            prisma_module_1.PrismaModule,
            schedule_1.ScheduleModule.forRoot(),
            infra_module_1.AgentInfraModule,
        ],
        controllers: [journey_assistant_controller_1.JourneyAssistantController],
        providers: [journey_assistant_service_1.JourneyAssistantService],
        exports: [journey_assistant_service_1.JourneyAssistantService],
    })
], JourneyAssistantModule);
//# sourceMappingURL=journey-assistant.module.js.map