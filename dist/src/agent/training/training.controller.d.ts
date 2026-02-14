import { TrajectoryCollectionService } from './services/trajectory-collection.service';
import { TrajectoryValidatorService } from './services/trajectory-validator.service';
import { TrainingDataPreparationService } from './services/training-data-preparation.service';
import { TrajectoryETLService } from './services/trajectory-etl.service';
import { DataQualityCheckerService } from './services/data-quality-checker.service';
import { DatasetVersionManagerService } from './services/dataset-version-manager.service';
import { TrainingPipelineService } from './services/training-pipeline.service';
import { ModelRegistryService } from './services/model-registry.service';
import { PolicyServiceManagerService } from './services/policy-service-manager.service';
import { EvalSuiteService } from './services/eval-suite.service';
import { OfflinePolicyEvaluatorService } from './services/offline-policy-evaluator.service';
import { ReplayComparatorService } from './services/replay-comparator.service';
import { RegressionGateService } from './services/regression-gate.service';
import { TrainingMetricsService } from './services/training-metrics.service';
import { TrainingBatchProcessorService } from './services/training-batch-processor.service';
import { ModelCollapseMonitorService } from './services/model-collapse-monitor.service';
import { TrainingQualityAnalyzerService } from './services/training-quality-analyzer.service';
import { ConstraintsEngineService } from './services/constraints-engine.service';
import { RiskEventManagerService } from './services/risk-event-manager.service';
import { ComplianceAuditService } from './services/compliance-audit.service';
import { SecurityRedTeamService } from './services/security-red-team.service';
import { RewardDefinitionService } from './services/reward-definition.service';
import { UserFeedbackLoopService } from './services/user-feedback-loop.service';
import { ABTestManagerService } from './services/ab-test-manager.service';
import { ExplainableOutputService } from './services/explainable-output.service';
import { ClarificationPromptDesignerService } from './services/clarification-prompt-designer.service';
import { RiskPromptDesignerService } from './services/risk-prompt-designer.service';
import { DecisionExplanationDesignerService } from './services/decision-explanation-designer.service';
import { DomainExpertKnowledgeService } from './services/domain-expert-knowledge.service';
import { JudgePromptDesignerService } from './services/judge-prompt-designer.service';
import { RewardModelTrainerService } from './services/reward-model-trainer.service';
import { DiagnosticLabelSystemService } from './services/diagnostic-label-system.service';
import { QualityScorerService } from './services/quality-scorer.service';
import { RollMonitoringService } from './services/roll-monitoring.service';
import { RollABTestService } from './services/roll-ab-test.service';
import { IterativeDeploymentWorkflowService } from './services/iterative-deployment-workflow.service';
import { ModelABTestService } from './services/model-ab-test.service';
import { CollectTrajectoryDto, ValidateTrajectoryDto, CollectTrajectoryResponseDto, ValidateTrajectoryResponseDto } from './dto/trajectory.dto';
import { ClassifyRiskEventDto, TrackUserActionDto, GetClarificationPromptDto, GetRiskPromptDto, GetRedLineRulesDto, ListRedTeamTestCasesDto, CreateBatchTaskDto } from './dto/training.dto';
export declare class TrainingController {
    private readonly collectionService;
    private readonly validatorService;
    private readonly trainingDataPrepService;
    private readonly etlService;
    private readonly qualityChecker;
    private readonly versionManager;
    private readonly trainingPipeline;
    private readonly modelRegistry;
    private readonly policyService;
    private readonly evalSuite;
    private readonly opeEvaluator;
    private readonly replayComparator;
    private readonly regressionGate;
    private readonly constraintsEngine;
    private readonly riskEventManager;
    private readonly complianceAudit;
    private readonly securityRedTeam;
    private readonly rewardDefinition;
    private readonly userFeedbackLoop;
    private readonly abTestManager;
    private readonly explainableOutput;
    private readonly clarificationPromptDesigner;
    private readonly riskPromptDesigner;
    private readonly decisionExplanationDesigner;
    private readonly domainExpertKnowledge;
    private readonly judgePromptDesigner;
    private readonly rewardModelTrainer;
    private readonly diagnosticLabelSystem;
    private readonly qualityScorer;
    private readonly metricsService;
    private readonly batchProcessor;
    private readonly collapseMonitor;
    private readonly qualityAnalyzer;
    private readonly rollMonitoring?;
    private readonly rollABTest?;
    private readonly iterativeDeploymentWorkflow?;
    private readonly modelABTest?;
    private readonly logger;
    constructor(collectionService: TrajectoryCollectionService, validatorService: TrajectoryValidatorService, trainingDataPrepService: TrainingDataPreparationService, etlService: TrajectoryETLService, qualityChecker: DataQualityCheckerService, versionManager: DatasetVersionManagerService, trainingPipeline: TrainingPipelineService, modelRegistry: ModelRegistryService, policyService: PolicyServiceManagerService, evalSuite: EvalSuiteService, opeEvaluator: OfflinePolicyEvaluatorService, replayComparator: ReplayComparatorService, regressionGate: RegressionGateService, constraintsEngine: ConstraintsEngineService, riskEventManager: RiskEventManagerService, complianceAudit: ComplianceAuditService, securityRedTeam: SecurityRedTeamService, rewardDefinition: RewardDefinitionService, userFeedbackLoop: UserFeedbackLoopService, abTestManager: ABTestManagerService, explainableOutput: ExplainableOutputService, clarificationPromptDesigner: ClarificationPromptDesignerService, riskPromptDesigner: RiskPromptDesignerService, decisionExplanationDesigner: DecisionExplanationDesignerService, domainExpertKnowledge: DomainExpertKnowledgeService, judgePromptDesigner: JudgePromptDesignerService, rewardModelTrainer: RewardModelTrainerService, diagnosticLabelSystem: DiagnosticLabelSystemService, qualityScorer: QualityScorerService, metricsService: TrainingMetricsService, batchProcessor: TrainingBatchProcessorService, collapseMonitor: ModelCollapseMonitorService, qualityAnalyzer: TrainingQualityAnalyzerService, rollMonitoring?: RollMonitoringService, rollABTest?: RollABTestService, iterativeDeploymentWorkflow?: IterativeDeploymentWorkflowService, modelABTest?: ModelABTestService);
    collectTrajectory(dto: CollectTrajectoryDto): Promise<{
        success: boolean;
        data: CollectTrajectoryResponseDto;
    }>;
    validateTrajectory(trajectoryId: string, dto: ValidateTrajectoryDto): Promise<{
        success: boolean;
        data: ValidateTrajectoryResponseDto;
    }>;
    findTrajectoryByRequestId(requestId: string): Promise<{
        success: boolean;
        data: {
            trajectoryId: string | null;
        };
    }>;
    prepareTrainingBatch(dto?: {
        minScore?: number;
        minReward?: number;
        maxUsageCount?: number;
        batchSize?: number;
        modelVersion?: string;
        countryCode?: string;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    markBatchAsUsed(batchId: string, dto: {
        trajectoryIds: string[];
    }): Promise<{
        success: boolean;
    }>;
    exportBatchToJSONL(batchId: string, dto?: {
        outputPath?: string;
    }): Promise<{
        success: boolean;
        data: {
            filePath: string;
            lineCount: number;
        };
    }>;
    exportBatchToJSON(batchId: string, dto?: {
        outputPath?: string;
    }): Promise<{
        success: boolean;
        data: {
            filePath: string;
            recordCount: number;
        };
    }>;
    getCollectionStats(dto?: {
        startDate?: string;
        endDate?: string;
        modelVersion?: string;
        countryCode?: string;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    getTrainingQuality(dto?: {
        minScore?: number;
        minReward?: number;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    createBatchTask(dto: CreateBatchTaskDto): Promise<{
        success: boolean;
        data: {
            taskId: string;
            status: string;
        };
    }>;
    getTaskStatus(taskId: string): Promise<{
        success: boolean;
        data: any;
    }>;
    getAllTasks(): Promise<{
        success: boolean;
        data: any[];
    }>;
    detectCollapseRisk(dto?: {
        modelVersion?: string;
        lookbackDays?: number;
        minTrajectories?: number;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    analyzeQuality(dto?: {
        startDate?: string;
        endDate?: string;
        modelVersion?: string;
        countryCode?: string;
        minScore?: number;
        minReward?: number;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    extractTrajectories(dto?: {
        trajectory_ids?: string[];
        request_ids?: string[];
        min_validation_score?: number;
        min_total_reward?: number;
        model_version?: string;
        country_code?: string;
        date_range?: {
            start: string;
            end: string;
        };
        limit?: number;
        offset?: number;
    }): Promise<{
        success: boolean;
        data: {
            count: number;
            trajectories: any[];
        };
    }>;
    exportTrajectories(dto?: {
        trajectory_ids?: string[];
        request_ids?: string[];
        min_validation_score?: number;
        min_total_reward?: number;
        model_version?: string;
        country_code?: string;
        date_range?: {
            start: string;
            end: string;
        };
        format?: 'jsonl' | 'json' | 'parquet';
        output_dir?: string;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    checkDataQuality(dto?: {
        trajectory_ids?: string[];
        request_ids?: string[];
        min_validation_score?: number;
        model_version?: string;
        country_code?: string;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    createDatasetVersion(dto: {
        export_result: any;
        quality_result: any;
        data_source: {
            date_range?: {
                start: string;
                end: string;
            };
            filter_criteria: Record<string, any>;
            total_trajectories: number;
        };
        anonymization?: {
            enabled: boolean;
            config_hash?: string;
        };
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    getDatasetVersion(version: string): Promise<{
        success: boolean;
        data: any;
    }>;
    listDatasetVersions(): Promise<{
        success: boolean;
        data: any[];
    }>;
    compareVersions(version1: string, version2: string): Promise<{
        success: boolean;
        data: any;
    }>;
    createTrainingJob(dto: {
        dataset_version: string;
        model_config: any;
        training_config: any;
        hyperparameter_search?: {
            enabled: boolean;
            search_space: any;
            num_trials?: number;
        };
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    startTraining(jobId: string): Promise<{
        success: boolean;
        data: any;
    }>;
    getAllEnumOptions(): Promise<{
        success: boolean;
        data: Record<string, any[]>;
    }>;
    getEnumOptions(enumKey: string): Promise<{
        success: boolean;
        data: any[];
    }>;
    getTrainingJobStatus(jobId: string): Promise<{
        success: boolean;
        data: any;
    }>;
    listTrainingJobs(): Promise<{
        success: boolean;
        data: any[];
    }>;
    registerModel(dto: {
        model_version: any;
        eval_metrics?: Record<string, number>;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    getModelVersion(version: string): Promise<{
        success: boolean;
        data: any;
    }>;
    listModelVersions(): Promise<{
        success: boolean;
        data: any[];
    }>;
    rollbackModel(version: string): Promise<{
        success: boolean;
        data: any;
    }>;
    policyPredict(dto: any): Promise<{
        success: boolean;
        data: any;
    }>;
    policyHealthCheck(): Promise<{
        success: boolean;
        data: any;
    }>;
    policyMetrics(): Promise<{
        success: boolean;
        data: any;
    }>;
    deployPolicyModel(dto: {
        model_version: string;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    evaluateRouter(dto: {
        model_version: string;
        test_cases?: any[];
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    evaluateGate(dto: {
        model_version: string;
        test_cases?: any[];
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    evaluateItinerary(dto: {
        model_version: string;
        test_cases?: any[];
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    evaluateFullPipeline(dto: {
        model_version: string;
        test_cases?: any[];
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    generateOPEReport(dto: {
        model_version: string;
        baseline_version?: string;
        trajectory_ids?: string[];
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    replayCompare(dto: {
        baseline_version: string;
        new_policy_version: string;
        trajectory_ids?: string[];
        request_ids?: string[];
        min_validation_score?: number;
        min_total_reward?: number;
        country_code?: string;
        date_range?: {
            start: string;
            end: string;
        };
        limit?: number;
        offset?: number;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    checkRegressionGate(dto: {
        new_policy_version: string;
        baseline_version: string;
        comparison_result: any;
        config?: any;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    checkConstraints(dto: {
        itinerary: any;
        context: {
            country_code?: string;
            season?: string;
            user_preferences?: Record<string, any>;
            model_version?: string;
        };
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    classifyRiskEvent(dto: ClassifyRiskEventDto): Promise<{
        success: boolean;
        data: any;
    }>;
    handleRiskEvent(eventId: string, dto: {
        action: 'APPROVE' | 'REJECT' | 'MITIGATE';
        resolved_by: string;
        mitigation_details?: string;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    recordAudit(dto: {
        request_id: string;
        decision_type: string;
        decision_result: string;
        constraint_check_result: any;
        context: {
            user_input: string;
            planning_request: Record<string, any>;
            model_version: string;
            experiment_id?: string;
        };
        risk_event?: any;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    getComplianceReportList(page?: string, limit?: string, periodStart?: string, periodEnd?: string): Promise<{
        success: boolean;
        data: any;
    }>;
    generateComplianceReport(dto: {
        period_start: string;
        period_end: string;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    runRedTeamTests(dto: {
        test_case_ids?: string[];
    }): Promise<{
        success: boolean;
        data: any[];
    }>;
    listRedTeamTestCases(dto?: ListRedTeamTestCasesDto): Promise<{
        success: boolean;
        data: any[];
    }>;
    calculateReward(dto: {
        metrics: {
            success_rate: number;
            satisfaction: number;
            cost: number;
            compliance_rate: number;
        };
        weights?: any;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    trackUserAction(dto: TrackUserActionDto): Promise<{
        success: boolean;
        data: any;
    }>;
    collectFeedback(dto: {
        user_id?: string;
        request_id: string;
        plan_id?: string;
        feedback: {
            satisfaction?: number;
            comments?: string;
            issues?: string[];
        };
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    analyzeFeedback(dto: {
        start_date: string;
        end_date: string;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    createABTest(dto: {
        name: string;
        description: string;
        variants: Array<{
            name: string;
            model_version: string;
            traffic_percentage: number;
        }>;
        success_metrics: string[];
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    assignToGroup(dto: {
        experiment_id: string;
        request_id: string;
        user_id?: string;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    analyzeABTestResults(dto: {
        experiment_id: string;
        variant_metrics: Array<{
            variant_id: string;
            sample_size: number;
            success_count: number;
            total_reward: number;
            total_latency_ms: number;
            error_count: number;
        }>;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    generateExplainableOutput(dto: {
        decision_log: any[];
        evidence_refs: any[];
        model_version: string;
        trace_id: string;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    getClarificationPrompt(query: GetClarificationPromptDto): Promise<{
        success: boolean;
        data: any;
    }>;
    getRiskPrompt(query: GetRiskPromptDto): Promise<{
        success: boolean;
        data: any;
    }>;
    scoreQuality(dto: {
        plan: any;
        user_request: string;
        evidence: any[];
        decision_log: any[];
        use_rm?: boolean;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    trainRewardModel(dto: {
        training_type: 'PREFERENCE_COMPARISON' | 'SCORE_REGRESSION';
        data: any[];
        config?: any;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    getRedLineRules(dto?: GetRedLineRulesDto): Promise<{
        success: boolean;
        data: any[];
    }>;
    getSeasonalRisks(dto?: {
        destination?: string;
        month?: number;
    }): Promise<{
        success: boolean;
        data: any[];
    }>;
    private getBaselineRewards;
    getRollMetrics(): Promise<any>;
    getRollWorkersStatus(): Promise<any>;
    getRollHealth(): Promise<any>;
    createRollABTestExperiment(dto: {
        name: string;
        description: string;
        variants: Array<{
            variant_id: string;
            name: string;
            roll_enabled: boolean;
            roll_config?: {
                use_policy_worker?: boolean;
                use_reward_worker?: boolean;
                use_trajectory_worker?: boolean;
                worker_config?: Record<string, any>;
            };
            traffic_percentage: number;
        }>;
        success_metrics: string[];
    }): Promise<{
        success: boolean;
        experimentId?: string;
        error?: string;
    }>;
    analyzeRollABTestResults(dto: {
        experiment_id: string;
        variant_metrics: Array<{
            variant_id: string;
            sample_size: number;
            success_count: number;
            total_reward: number;
            total_latency_ms: number;
            error_count: number;
            roll_enabled?: boolean;
        }>;
    }): Promise<{
        success: boolean;
        data?: any;
        error?: string;
    }>;
    shouldUseRoll(experimentId: string, requestId: string, userId?: string): Promise<{
        success: boolean;
        data: {
            shouldUse: boolean;
            reason: string;
        };
    }>;
    executeWorkflow(dto: {
        minScore?: number;
        minReward?: number;
        batchSize?: number;
        modelConfig?: any;
        trainingConfig?: any;
        autoDeploy?: boolean;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    getWorkflowStatus(workflowId: string): Promise<{
        success: boolean;
        data: any;
    }>;
    createModelVersionExperiment(dto: {
        name: string;
        description: string;
        controlVersion: string;
        treatmentVersion: string;
        trafficSplit?: {
            control: number;
            treatment: number;
        };
        successMetrics: string[];
        minSampleSize?: number;
        durationDays?: number;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    analyzeModelVersionComparison(dto: {
        experimentId: string;
        controlVersion: string;
        treatmentVersion: string;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    promoteModelVersion(dto: {
        experimentId: string;
        treatmentVersion: string;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    checkShouldUseRoll(experimentId: string, requestId: string, userId?: string): Promise<{
        success: boolean;
        use_roll?: boolean;
        variant_id?: string;
        roll_config?: any;
        error?: string;
    }>;
}
