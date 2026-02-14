"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataFusionModule = void 0;
const common_1 = require("@nestjs/common");
const data_conflict_resolution_service_1 = require("./services/data-conflict-resolution.service");
const feature_quality_assessment_service_1 = require("./services/feature-quality-assessment.service");
const fusion_resilience_service_1 = require("./services/fusion-resilience.service");
const fusion_resource_manager_service_1 = require("./services/fusion-resource-manager.service");
const data_quality_module_1 = require("../data-quality/data-quality.module");
let DataFusionModule = class DataFusionModule {
};
exports.DataFusionModule = DataFusionModule;
exports.DataFusionModule = DataFusionModule = __decorate([
    (0, common_1.Module)({
        imports: [data_quality_module_1.DataQualityModule],
        providers: [
            data_conflict_resolution_service_1.DataConflictResolutionService,
            feature_quality_assessment_service_1.FeatureQualityAssessmentService,
            fusion_resilience_service_1.FusionResilienceService,
            fusion_resource_manager_service_1.FusionResourceManagerService,
        ],
        exports: [
            data_conflict_resolution_service_1.DataConflictResolutionService,
            feature_quality_assessment_service_1.FeatureQualityAssessmentService,
            fusion_resilience_service_1.FusionResilienceService,
            fusion_resource_manager_service_1.FusionResourceManagerService,
        ],
    })
], DataFusionModule);
//# sourceMappingURL=data-fusion.module.js.map