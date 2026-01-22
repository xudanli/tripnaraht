// src/agent/training/training.module.ts

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TrajectoryValidatorService } from './services/trajectory-validator.service';
import { TrajectoryCollectionService } from './services/trajectory-collection.service';
import { RewardSignalExtractorService } from './services/reward-signal-extractor.service';
import { TrainingDataPreparationService } from './services/training-data-preparation.service';
import { TrajectoryETLService } from './services/trajectory-etl.service';
import { DataQualityCheckerService } from './services/data-quality-checker.service';
import { PIIAnonymizerService } from './services/pii-anonymizer.service';
import { DatasetVersionManagerService } from './services/dataset-version-manager.service';
import { TrainingPipelineService } from './services/training-pipeline.service';
import { ModelRegistryService } from './services/model-registry.service';
import { PolicyServiceManagerService } from './services/policy-service-manager.service';
import { EvalSuiteService } from './services/eval-suite.service';
import { OfflinePolicyEvaluatorService } from './services/offline-policy-evaluator.service';
import { ReplayComparatorService } from './services/replay-comparator.service';
import { RegressionGateService } from './services/regression-gate.service';
import { PolicyOrchestratorIntegrationService } from './services/policy-orchestrator-integration.service';
import { ObservabilityService } from './services/observability.service';
import { CircuitBreakerService } from './services/circuit-breaker.service';
import { RateLimiterService } from './services/rate-limiter.service';
import { RetryPolicyService } from './services/retry-policy.service';
import { FallbackStrategyService } from './services/fallback-strategy.service';
import { CostGovernanceService } from './services/cost-governance.service';
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
import { TrainingMetricsService } from './services/training-metrics.service';
import { TrainingBatchProcessorService } from './services/training-batch-processor.service';
import { ModelCollapseMonitorService } from './services/model-collapse-monitor.service';
import { TrainingQualityAnalyzerService } from './services/training-quality-analyzer.service';
import { TestCaseManagerService } from './services/test-case-manager.service';
import { ConstraintRuleManagerService } from './services/constraint-rule-manager.service';
import { RLIntegrationService } from './services/rl-integration.service';
import { RollClientService } from './services/roll-client.service';
import { RollPolicyAdapterService } from './services/roll-policy-adapter.service';
import { RollTrajectoryAdapterService } from './services/roll-trajectory-adapter.service';
import { RollRewardAdapterService } from './services/roll-reward-adapter.service';
import { RollMonitoringService } from './services/roll-monitoring.service';
import { RollRetryService } from './services/roll-retry.service';
import { RollCircuitBreakerService } from './services/roll-circuit-breaker.service';
import { RollConnectionPoolService } from './services/roll-connection-pool.service';
import { RollCacheService } from './services/roll-cache.service';
import { RollBatchProcessorService } from './services/roll-batch-processor.service';
import { RollTracingService } from './services/roll-tracing.service';
import { RollABTestService } from './services/roll-ab-test.service';
import { IterativeDeploymentWorkflowService } from './services/iterative-deployment-workflow.service';
import { ModelABTestService } from './services/model-ab-test.service';
import { ConfigModule } from '@nestjs/config';
import { TrainingController } from './training.controller';
import { LlmModule } from '../../llm/llm.module';
import { MLflowClientService } from './services/mlflow-client.service';

/**
 * TrainingModule
 * 
 * Iterative Deployment 训练模块
 */
@Module({
  imports: [PrismaModule, ConfigModule, LlmModule],
  controllers: [TrainingController],
  providers: [
    MLflowClientService,
    TrajectoryValidatorService,
    TrajectoryCollectionService,
    RewardSignalExtractorService,
    TrainingDataPreparationService,
    TrajectoryETLService,
    DataQualityCheckerService,
    PIIAnonymizerService,
    DatasetVersionManagerService,
    TrainingPipelineService,
    ModelRegistryService,
    PolicyServiceManagerService,
    EvalSuiteService,
    OfflinePolicyEvaluatorService,
    ReplayComparatorService,
    RegressionGateService,
    PolicyOrchestratorIntegrationService,
    ObservabilityService,
    CircuitBreakerService,
    RateLimiterService,
    RetryPolicyService,
    FallbackStrategyService,
    CostGovernanceService,
    ConstraintsEngineService,
    RiskEventManagerService,
    ComplianceAuditService,
    SecurityRedTeamService,
    RewardDefinitionService,
    UserFeedbackLoopService,
    ABTestManagerService,
    ExplainableOutputService,
    ClarificationPromptDesignerService,
    RiskPromptDesignerService,
    DecisionExplanationDesignerService,
    DomainExpertKnowledgeService,
    JudgePromptDesignerService,
    RewardModelTrainerService,
    DiagnosticLabelSystemService,
    QualityScorerService,
    TrainingMetricsService,
    TrainingBatchProcessorService,
    ModelCollapseMonitorService,
    TrainingQualityAnalyzerService,
    TestCaseManagerService,
    ConstraintRuleManagerService,
    RLIntegrationService,
    RollClientService,
    RollPolicyAdapterService,
    RollTrajectoryAdapterService,
    RollRewardAdapterService,
    RollMonitoringService,
    RollRetryService,
    RollCircuitBreakerService,
    RollConnectionPoolService,
    RollCacheService,
    RollBatchProcessorService,
    RollTracingService,
    RollABTestService,
    IterativeDeploymentWorkflowService,
    ModelABTestService,
  ],
  exports: [
    TrajectoryValidatorService,
    TrajectoryCollectionService,
    RewardSignalExtractorService,
    TrainingDataPreparationService,
    TrajectoryETLService,
    DataQualityCheckerService,
    PIIAnonymizerService,
    DatasetVersionManagerService,
    TrainingPipelineService,
    ModelRegistryService,
    PolicyServiceManagerService,
    EvalSuiteService,
    OfflinePolicyEvaluatorService,
    ReplayComparatorService,
    RegressionGateService,
    PolicyOrchestratorIntegrationService,
    ObservabilityService,
    CircuitBreakerService,
    RateLimiterService,
    RetryPolicyService,
    FallbackStrategyService,
    CostGovernanceService,
    ConstraintsEngineService,
    RiskEventManagerService,
    ComplianceAuditService,
    SecurityRedTeamService,
    RewardDefinitionService,
    UserFeedbackLoopService,
    ABTestManagerService,
    ExplainableOutputService,
    ClarificationPromptDesignerService,
    RiskPromptDesignerService,
    DecisionExplanationDesignerService,
    DomainExpertKnowledgeService,
    JudgePromptDesignerService,
    RewardModelTrainerService,
    DiagnosticLabelSystemService,
    QualityScorerService,
    TrainingMetricsService,
    TrainingBatchProcessorService,
    ModelCollapseMonitorService,
    TrainingQualityAnalyzerService,
    TestCaseManagerService,
    ConstraintRuleManagerService,
    RLIntegrationService,
    RollClientService,
    RollPolicyAdapterService,
    RollTrajectoryAdapterService,
    RollRewardAdapterService,
    RollMonitoringService,
    RollRetryService,
    RollCircuitBreakerService,
    RollConnectionPoolService,
    RollCacheService,
    RollBatchProcessorService,
    RollTracingService,
    RollABTestService,
    IterativeDeploymentWorkflowService,
    ModelABTestService,
  ],
})
export class TrainingModule {}
