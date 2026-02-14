"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SharedAssistantsModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_module_1 = require("../../../prisma/prisma.module");
const llm_module_1 = require("../../../llm/llm.module");
const persona_language_service_1 = require("./services/persona-language.service");
const recommendation_engine_service_1 = require("./services/recommendation-engine.service");
const preference_learning_service_1 = require("./services/preference-learning.service");
const route_directions_module_1 = require("../../../route-directions/route-directions.module");
let SharedAssistantsModule = class SharedAssistantsModule {
};
exports.SharedAssistantsModule = SharedAssistantsModule;
exports.SharedAssistantsModule = SharedAssistantsModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            llm_module_1.LlmModule,
            (0, common_1.forwardRef)(() => route_directions_module_1.RouteDirectionsModule),
        ],
        providers: [
            persona_language_service_1.PersonaLanguageService,
            recommendation_engine_service_1.RecommendationEngineService,
            preference_learning_service_1.PreferenceLearningService,
        ],
        exports: [
            persona_language_service_1.PersonaLanguageService,
            recommendation_engine_service_1.RecommendationEngineService,
            preference_learning_service_1.PreferenceLearningService,
        ],
    })
], SharedAssistantsModule);
//# sourceMappingURL=shared-assistants.module.js.map