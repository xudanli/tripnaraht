"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssistantsModule = void 0;
const common_1 = require("@nestjs/common");
const shared_assistants_module_1 = require("./shared/shared-assistants.module");
const planning_assistant_module_1 = require("./planning-assistant/planning-assistant.module");
const trip_planner_module_1 = require("./trip-planner/trip-planner.module");
const journey_assistant_module_1 = require("./journey-assistant/journey-assistant.module");
let AssistantsModule = class AssistantsModule {
};
exports.AssistantsModule = AssistantsModule;
exports.AssistantsModule = AssistantsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            shared_assistants_module_1.SharedAssistantsModule,
            planning_assistant_module_1.PlanningAssistantModule,
            trip_planner_module_1.TripPlannerModule,
            journey_assistant_module_1.JourneyAssistantModule,
        ],
        exports: [
            shared_assistants_module_1.SharedAssistantsModule,
            planning_assistant_module_1.PlanningAssistantModule,
            trip_planner_module_1.TripPlannerModule,
            journey_assistant_module_1.JourneyAssistantModule,
        ],
    })
], AssistantsModule);
//# sourceMappingURL=assistants.module.js.map