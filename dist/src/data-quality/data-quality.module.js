"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataQualityModule = void 0;
const common_1 = require("@nestjs/common");
const data_quality_framework_service_1 = require("./services/data-quality-framework.service");
const source_annotation_service_1 = require("./services/source-annotation.service");
const confidence_annotation_service_1 = require("./services/confidence-annotation.service");
const data_lineage_service_1 = require("./services/data-lineage.service");
const data_improvement_service_1 = require("./services/data-improvement.service");
const geographic_data_validator_service_1 = require("./services/geographic-data-validator.service");
const data_quality_monitoring_service_1 = require("./services/data-quality-monitoring.service");
const data_quality_alert_service_1 = require("./services/data-quality-alert.service");
const geographic_data_quality_monitoring_service_1 = require("./services/geographic-data-quality-monitoring.service");
const geographic_data_assessment_service_1 = require("./services/geographic-data-assessment.service");
const data_update_scheduler_service_1 = require("./services/data-update-scheduler.service");
const data_collection_service_1 = require("./services/data-collection.service");
const dem_resolution_cache_service_1 = require("./services/dem-resolution-cache.service");
const prisma_module_1 = require("../prisma/prisma.module");
const decision_module_1 = require("../trips/decision/decision.module");
const postgresql_mcp_module_1 = require("../mcp/postgresql-mcp.module");
let DataQualityModule = class DataQualityModule {
};
exports.DataQualityModule = DataQualityModule;
exports.DataQualityModule = DataQualityModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            (0, common_1.forwardRef)(() => decision_module_1.DecisionModule),
            postgresql_mcp_module_1.PostgreSQLMcpModule,
        ],
        providers: [
            data_quality_framework_service_1.DataQualityFrameworkService,
            source_annotation_service_1.SourceAnnotationService,
            confidence_annotation_service_1.ConfidenceAnnotationService,
            data_lineage_service_1.DataLineageService,
            data_improvement_service_1.DataImprovementService,
            geographic_data_validator_service_1.GeographicDataValidatorService,
            data_quality_monitoring_service_1.DataQualityMonitoringService,
            data_quality_alert_service_1.DataQualityAlertService,
            geographic_data_quality_monitoring_service_1.GeographicDataQualityMonitoringService,
            geographic_data_assessment_service_1.GeographicDataAssessmentService,
            data_update_scheduler_service_1.DataUpdateSchedulerService,
            data_collection_service_1.DataCollectionService,
            dem_resolution_cache_service_1.DEMResolutionCacheService,
        ],
        exports: [
            data_quality_framework_service_1.DataQualityFrameworkService,
            source_annotation_service_1.SourceAnnotationService,
            confidence_annotation_service_1.ConfidenceAnnotationService,
            data_lineage_service_1.DataLineageService,
            data_improvement_service_1.DataImprovementService,
            geographic_data_validator_service_1.GeographicDataValidatorService,
            data_quality_monitoring_service_1.DataQualityMonitoringService,
            data_quality_alert_service_1.DataQualityAlertService,
            geographic_data_quality_monitoring_service_1.GeographicDataQualityMonitoringService,
            geographic_data_assessment_service_1.GeographicDataAssessmentService,
            data_update_scheduler_service_1.DataUpdateSchedulerService,
            data_collection_service_1.DataCollectionService,
            dem_resolution_cache_service_1.DEMResolutionCacheService,
        ],
    })
], DataQualityModule);
//# sourceMappingURL=data-quality.module.js.map