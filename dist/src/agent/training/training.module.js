"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrainingModule = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const config_1 = require("@nestjs/config");
const prisma_module_1 = require("../../prisma/prisma.module");
const fine_tune_service_1 = require("./services/fine-tune.service");
const vllm_client_service_1 = require("./services/vllm-client.service");
const llm_judge_client_service_1 = require("./services/llm-judge-client.service");
const trajectory_collection_service_1 = require("./services/trajectory-collection.service");
const trajectory_validator_service_1 = require("./services/trajectory-validator.service");
const reward_signal_extractor_service_1 = require("./services/reward-signal-extractor.service");
const training_data_preparation_service_1 = require("./services/training-data-preparation.service");
const training_pipeline_service_1 = require("./services/training-pipeline.service");
const model_registry_service_1 = require("./services/model-registry.service");
const mlflow_client_service_1 = require("./services/mlflow-client.service");
const dataset_version_manager_service_1 = require("./services/dataset-version-manager.service");
const training_batch_processor_service_1 = require("./services/training-batch-processor.service");
const training_quality_analyzer_service_1 = require("./services/training-quality-analyzer.service");
const model_collapse_monitor_service_1 = require("./services/model-collapse-monitor.service");
const iterative_deployment_workflow_service_1 = require("./services/iterative-deployment-workflow.service");
const eval_suite_service_1 = require("./services/eval-suite.service");
const regression_gate_service_1 = require("./services/regression-gate.service");
const replay_comparator_service_1 = require("./services/replay-comparator.service");
const trajectory_etl_service_1 = require("./services/trajectory-etl.service");
const data_quality_checker_service_1 = require("./services/data-quality-checker.service");
const pii_anonymizer_service_1 = require("./services/pii-anonymizer.service");
const training_controller_1 = require("./controllers/training.controller");
let TrainingModule = class TrainingModule {
};
exports.TrainingModule = TrainingModule;
exports.TrainingModule = TrainingModule = __decorate([
    (0, common_1.Module)({
        imports: [
            axios_1.HttpModule.register({
                timeout: 60000,
                maxRedirects: 5,
            }),
            config_1.ConfigModule,
            prisma_module_1.PrismaModule,
        ],
        controllers: [
            training_controller_1.TrainingController,
        ],
        providers: [
            fine_tune_service_1.FineTuneService,
            vllm_client_service_1.VllmClientService,
            llm_judge_client_service_1.LlmJudgeClientService,
            trajectory_collection_service_1.TrajectoryCollectionService,
            trajectory_validator_service_1.TrajectoryValidatorService,
            reward_signal_extractor_service_1.RewardSignalExtractorService,
            training_data_preparation_service_1.TrainingDataPreparationService,
            training_pipeline_service_1.TrainingPipelineService,
            mlflow_client_service_1.MLflowClientService,
            model_registry_service_1.ModelRegistryService,
            dataset_version_manager_service_1.DatasetVersionManagerService,
            training_batch_processor_service_1.TrainingBatchProcessorService,
            training_quality_analyzer_service_1.TrainingQualityAnalyzerService,
            model_collapse_monitor_service_1.ModelCollapseMonitorService,
            data_quality_checker_service_1.DataQualityCheckerService,
            pii_anonymizer_service_1.PIIAnonymizerService,
            eval_suite_service_1.EvalSuiteService,
            regression_gate_service_1.RegressionGateService,
            replay_comparator_service_1.ReplayComparatorService,
            trajectory_etl_service_1.TrajectoryETLService,
            iterative_deployment_workflow_service_1.IterativeDeploymentWorkflowService,
        ],
        exports: [
            fine_tune_service_1.FineTuneService,
            vllm_client_service_1.VllmClientService,
            llm_judge_client_service_1.LlmJudgeClientService,
            trajectory_collection_service_1.TrajectoryCollectionService,
            trajectory_validator_service_1.TrajectoryValidatorService,
            reward_signal_extractor_service_1.RewardSignalExtractorService,
            training_data_preparation_service_1.TrainingDataPreparationService,
            training_pipeline_service_1.TrainingPipelineService,
            mlflow_client_service_1.MLflowClientService,
            model_registry_service_1.ModelRegistryService,
            iterative_deployment_workflow_service_1.IterativeDeploymentWorkflowService,
        ],
    })
], TrainingModule);
//# sourceMappingURL=training.module.js.map