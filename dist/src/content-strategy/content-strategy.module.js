"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentStrategyModule = void 0;
const common_1 = require("@nestjs/common");
const copy_standards_service_1 = require("./services/copy-standards.service");
const user_journey_communication_service_1 = require("./services/user-journey-communication.service");
const brand_expression_service_1 = require("./services/brand-expression.service");
const persona_based_communication_service_1 = require("./services/persona-based-communication.service");
const copy_example_library_service_1 = require("./services/copy-example-library.service");
const brand_story_service_1 = require("./services/brand-story.service");
const localization_service_1 = require("./services/localization.service");
const content_strategy_qa_service_1 = require("./services/content-strategy-qa.service");
const route_directions_module_1 = require("../route-directions/route-directions.module");
const decision_module_1 = require("../trips/decision/decision.module");
let ContentStrategyModule = class ContentStrategyModule {
};
exports.ContentStrategyModule = ContentStrategyModule;
exports.ContentStrategyModule = ContentStrategyModule = __decorate([
    (0, common_1.Module)({
        imports: [route_directions_module_1.RouteDirectionsModule, decision_module_1.DecisionModule],
        providers: [
            copy_standards_service_1.CopyStandardsService,
            user_journey_communication_service_1.UserJourneyCommunicationService,
            brand_expression_service_1.BrandExpressionService,
            persona_based_communication_service_1.PersonaBasedCommunicationService,
            copy_example_library_service_1.CopyExampleLibraryService,
            brand_story_service_1.BrandStoryService,
            localization_service_1.LocalizationService,
            content_strategy_qa_service_1.ContentStrategyQAService,
        ],
        exports: [
            copy_standards_service_1.CopyStandardsService,
            user_journey_communication_service_1.UserJourneyCommunicationService,
            brand_expression_service_1.BrandExpressionService,
            persona_based_communication_service_1.PersonaBasedCommunicationService,
            copy_example_library_service_1.CopyExampleLibraryService,
            brand_story_service_1.BrandStoryService,
            localization_service_1.LocalizationService,
            content_strategy_qa_service_1.ContentStrategyQAService,
        ],
    })
], ContentStrategyModule);
//# sourceMappingURL=content-strategy.module.js.map