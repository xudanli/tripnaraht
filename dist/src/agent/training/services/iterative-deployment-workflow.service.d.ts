import { TrajectoryCollectionService } from './trajectory-collection.service';
import { TrajectoryValidatorService } from './trajectory-validator.service';
import { RewardSignalExtractorService } from './reward-signal-extractor.service';
import { TrainingDataPreparationService } from './training-data-preparation.service';
import { TrainingPipelineService } from './training-pipeline.service';
import { ModelRegistryService } from './model-registry.service';
import { EvalSuiteService } from './eval-suite.service';
import { RegressionGateService } from './regression-gate.service';
import { ReplayComparatorService } from './replay-comparator.service';
import { TrajectoryETLService } from './trajectory-etl.service';
export declare class IterativeDeploymentWorkflowService {
    private readonly trajectoryCollection;
    private readonly trajectoryValidator;
    private readonly rewardExtractor;
    private readonly dataPrep;
    private readonly trainingPipeline;
    private readonly modelRegistry;
    private readonly evalSuite;
    private readonly regressionGate;
    private readonly replayComparator;
    private readonly trajectoryETL;
    private readonly logger;
    constructor(trajectoryCollection: TrajectoryCollectionService, trajectoryValidator: TrajectoryValidatorService, rewardExtractor: RewardSignalExtractorService, dataPrep: TrainingDataPreparationService, trainingPipeline: TrainingPipelineService, modelRegistry: ModelRegistryService, evalSuite: EvalSuiteService, regressionGate: RegressionGateService, replayComparator: ReplayComparatorService, trajectoryETL: TrajectoryETLService);
    executeWorkflow(options: {
        minScore?: number;
        minReward?: number;
        batchSize?: number;
        modelConfig?: any;
        trainingConfig?: any;
        autoDeploy?: boolean;
    }): Promise<{
        workflowId: string;
        status: 'SUCCESS' | 'FAILED' | 'BLOCKED';
        steps: Array<{
            step: string;
            status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
            result?: any;
            error?: string;
        }>;
        modelVersion?: string;
    }>;
    getWorkflowStatus(workflowId: string): Promise<{
        workflowId: string;
        status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'BLOCKED';
        currentStep?: string;
        steps: Array<{
            step: string;
            status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'RUNNING';
        }>;
    }>;
}
