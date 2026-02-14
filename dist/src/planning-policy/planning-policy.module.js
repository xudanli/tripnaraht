"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanningPolicyModule = void 0;
const common_1 = require("@nestjs/common");
const policy_compiler_service_1 = require("./services/policy-compiler.service");
const cost_model_service_1 = require("./services/cost-model.service");
const hp_simulator_service_1 = require("./services/hp-simulator.service");
const day_scheduler_service_1 = require("./services/day-scheduler.service");
const replanner_service_1 = require("./services/replanner.service");
const feasibility_service_1 = require("./services/feasibility.service");
const robustness_evaluator_service_1 = require("./services/robustness-evaluator.service");
const ranking_service_1 = require("./services/ranking.service");
const place_to_poi_service_1 = require("./services/place-to-poi.service");
const place_to_poi_helper_service_1 = require("./services/place-to-poi-helper.service");
let PlanningPolicyModule = class PlanningPolicyModule {
};
exports.PlanningPolicyModule = PlanningPolicyModule;
exports.PlanningPolicyModule = PlanningPolicyModule = __decorate([
    (0, common_1.Module)({
        providers: [
            policy_compiler_service_1.PolicyCompilerService,
            cost_model_service_1.DefaultCostModel,
            hp_simulator_service_1.HpSimulatorService,
            day_scheduler_service_1.DaySchedulerService,
            replanner_service_1.ReplannerService,
            feasibility_service_1.FeasibilityService,
            robustness_evaluator_service_1.RobustnessEvaluatorService,
            ranking_service_1.RankingService,
            place_to_poi_service_1.PlaceToPoiService,
            place_to_poi_helper_service_1.PlaceToPoiHelperService,
        ],
        exports: [
            policy_compiler_service_1.PolicyCompilerService,
            cost_model_service_1.DefaultCostModel,
            hp_simulator_service_1.HpSimulatorService,
            day_scheduler_service_1.DaySchedulerService,
            replanner_service_1.ReplannerService,
            feasibility_service_1.FeasibilityService,
            robustness_evaluator_service_1.RobustnessEvaluatorService,
            ranking_service_1.RankingService,
            place_to_poi_service_1.PlaceToPoiService,
            place_to_poi_helper_service_1.PlaceToPoiHelperService,
        ],
    })
], PlanningPolicyModule);
//# sourceMappingURL=planning-policy.module.js.map