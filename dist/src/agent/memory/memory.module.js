"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryModule = void 0;
const common_1 = require("@nestjs/common");
const memory_service_1 = require("./services/memory.service");
const user_profile_mapper_service_1 = require("./services/user-profile-mapper.service");
const decision_params_injector_service_1 = require("./services/decision-params-injector.service");
const persona_identification_service_1 = require("./services/persona-identification.service");
const persona_state_manager_service_1 = require("./services/persona-state-manager.service");
const multi_persona_manager_service_1 = require("./services/multi-persona-manager.service");
const prisma_module_1 = require("../../prisma/prisma.module");
let MemoryModule = class MemoryModule {
};
exports.MemoryModule = MemoryModule;
exports.MemoryModule = MemoryModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule],
        providers: [
            memory_service_1.MemoryService,
            user_profile_mapper_service_1.UserProfileMapperService,
            decision_params_injector_service_1.DecisionParamsInjectorService,
            persona_identification_service_1.PersonaIdentificationService,
            multi_persona_manager_service_1.MultiPersonaManagerService,
            persona_state_manager_service_1.PersonaStateManagerService,
        ],
        exports: [
            memory_service_1.MemoryService,
            user_profile_mapper_service_1.UserProfileMapperService,
            decision_params_injector_service_1.DecisionParamsInjectorService,
            persona_identification_service_1.PersonaIdentificationService,
            multi_persona_manager_service_1.MultiPersonaManagerService,
            persona_state_manager_service_1.PersonaStateManagerService,
        ],
    })
], MemoryModule);
//# sourceMappingURL=memory.module.js.map