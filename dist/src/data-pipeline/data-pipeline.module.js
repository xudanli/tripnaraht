"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataPipelineModule = void 0;
const common_1 = require("@nestjs/common");
const data_quality_module_1 = require("../data-quality/data-quality.module");
const data_privacy_module_1 = require("../data-privacy/data-privacy.module");
const data_pipeline_service_1 = require("./services/data-pipeline.service");
const data_cleaning_service_1 = require("./services/data-cleaning.service");
const data_standardization_service_1 = require("./services/data-standardization.service");
let DataPipelineModule = class DataPipelineModule {
};
exports.DataPipelineModule = DataPipelineModule;
exports.DataPipelineModule = DataPipelineModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [data_quality_module_1.DataQualityModule, data_privacy_module_1.DataPrivacyModule],
        providers: [
            data_pipeline_service_1.DataPipelineService,
            data_cleaning_service_1.DataCleaningService,
            data_standardization_service_1.DataStandardizationService,
        ],
        exports: [
            data_pipeline_service_1.DataPipelineService,
            data_cleaning_service_1.DataCleaningService,
            data_standardization_service_1.DataStandardizationService,
        ],
    })
], DataPipelineModule);
//# sourceMappingURL=data-pipeline.module.js.map