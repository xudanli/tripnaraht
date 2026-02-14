"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScheduleActionModule = void 0;
const common_1 = require("@nestjs/common");
const schedule_action_service_1 = require("./schedule-action.service");
const planning_policy_module_1 = require("../planning-policy/planning-policy.module");
let ScheduleActionModule = class ScheduleActionModule {
};
exports.ScheduleActionModule = ScheduleActionModule;
exports.ScheduleActionModule = ScheduleActionModule = __decorate([
    (0, common_1.Module)({
        imports: [planning_policy_module_1.PlanningPolicyModule],
        providers: [schedule_action_service_1.ScheduleActionService],
        exports: [schedule_action_service_1.ScheduleActionService],
    })
], ScheduleActionModule);
//# sourceMappingURL=schedule-action.module.js.map