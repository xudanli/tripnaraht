import { Injectable, Logger, Optional } from '@nestjs/common';
import type {
  EvolutionResult,
  EvolutionRoundResult,
  EvolveSkillOptions,
  ExplorationStrategy,
  SkillEvolverEvalContext,
  SkillEvolverTask,
  SkillTrajectoryBatchComparison,
  StrategyRunResult,
} from '../interfaces/skill-evolver.types';
import { SkillRegistryService } from './skill-registry.service';
import { TrajectoryStoreService } from './trajectory-store.service';
import { StrategyExplorerService } from './strategy-explorer.service';
import { SkillExecutorService } from './skill-executor.service';
import { SkillEvolverEvaluatorService } from './skill-evolver-evaluator.service';
import { ContrastiveAnalyzerService } from './contrastive-analyzer.service';
import { SkillEditorService } from './skill-editor.service';
import { IndependentAuditorService } from './independent-auditor.service';
import { SkillEvolverLlmHelper } from './skill-evolver-llm.helper';
import { SkillEvolverRegressionGateService } from './skill-evolver-regression-gate.service';
import { SkillEvolverBatchComparatorService } from './skill-evolver-batch-comparator.service';
import { AgentSkillsInteropService } from './agent-skills-interop.service';
import { ensureSkillBodyAssertions } from '../utils/ensure-skill-body-assertions.util';
import { isLiveDecisionReplayEnabled } from '../utils/decision-replay-trajectory.util';

@Injectable()
export class MetaSkillEngineService {
  private readonly logger = new Logger(MetaSkillEngineService.name);

  constructor(
    private readonly registry: SkillRegistryService,
    private readonly store: TrajectoryStoreService,
    private readonly explorer: StrategyExplorerService,
    private readonly executor: SkillExecutorService,
    private readonly evaluator: SkillEvolverEvaluatorService,
    private readonly analyzer: ContrastiveAnalyzerService,
    private readonly editor: SkillEditorService,
    private readonly auditor: IndependentAuditorService,
    private readonly llm: SkillEvolverLlmHelper,
    private readonly regressionGate: SkillEvolverRegressionGateService,
    private readonly batchComparator: SkillEvolverBatchComparatorService,
    @Optional() private readonly agentSkillsInterop?: AgentSkillsInteropService,
  ) {}

  async evolve(
    skillId: string,
    taskBatchOrOptions: SkillEvolverTask[] | EvolveSkillOptions,
    maybeOptions: EvolveSkillOptions = {},
  ): Promise<EvolutionResult> {
    let inlineTasks: SkillEvolverTask[] | undefined;
    let options: EvolveSkillOptions;
    if (Array.isArray(taskBatchOrOptions)) {
      inlineTasks = taskBatchOrOptions;
      options = maybeOptions;
    } else {
      options = taskBatchOrOptions;
      inlineTasks = undefined;
    }

    const { tasks, assertions, sourceE2eCaseId } = this.registry.resolveTasksAndAssertions({
      tasks: inlineTasks,
      taskBatchId: options.taskBatchId,
      replayCaseId: options.replayCaseId,
    });

    const useDecisionReplay =
      options.useDecisionReplay === true ||
      (options.useDecisionReplay !== false &&
        !!sourceE2eCaseId &&
        process.env.SKILL_EVOLVER_USE_DECISION_REPLAY !== 'false');

    const evalMode =
      options.evalMode ??
      (useDecisionReplay && sourceE2eCaseId
        ? 'decision_replay'
        : options.replayCaseId || assertions?.length
          ? 'fixture'
          : 'llm');

    const liveDecisionReplay =
      options.liveDecisionReplay === true ||
      (options.liveDecisionReplay !== false && isLiveDecisionReplayEnabled());

    const evalCtx: SkillEvolverEvalContext = {
      mode: evalMode,
      assertions,
      fixtureCaseId: options.replayCaseId,
      sourceE2eCaseId,
      liveDecisionReplay: liveDecisionReplay || undefined,
    };

    if (evalMode === 'decision_replay') {
      this.logger.log(
        `[MetaSkillEngine] eval=decision_replay e2e=${sourceE2eCaseId} live=${liveDecisionReplay}`,
      );
    }

    const maxRounds = options.maxRounds ?? 5;
    const k = options.strategyCount ?? 4;
    const minDelta = options.minScoreDelta ?? 1;
    const stopAfterNoImprove = options.noImprovementStopRounds ?? 2;
    const dryRun = options.dryRun ?? false;
    const useRegressionGate = options.regressionGate !== false;
    const forceEditBelowScore = options.forceEditBelowScore ?? 100;
    const forceEditWhenStuck = options.forceEditWhenStuck !== false;

    if (!this.llm.isAvailable() && evalMode === 'llm') {
      this.logger.warn('[MetaSkillEngine] LlmService 未注入，llm 模式将使用 fallback');
    }

    let currentSkill = options.seedId
      ? this.registry.loadSeed(skillId, options.seedId, options.artifactType)
      : this.registry.load(skillId, options.artifactType);
    if (options.seedId) {
      this.logger.log(`[MetaSkillEngine] using seed "${options.seedId}" for ${skillId}`);
    }
    const baselineEval = await this.evaluator.evaluateSkillOnBatch(currentSkill, tasks, evalCtx);
    let bestScore = baselineEval.avgScore;
    let lastBatchComparison: SkillTrajectoryBatchComparison | undefined;
    const initialVersion = currentSkill.version;
    const initialScore = bestScore;
    const rounds: EvolutionRoundResult[] = [];
    let noImproveStreak = 0;

    this.logger.log(
      `[MetaSkillEngine] evolve ${skillId} v${initialVersion} score=${initialScore} mode=${evalMode} tasks=${tasks.length}`,
    );

    const decisionReplayStrategy: ExplorationStrategy = {
      strategyId: 'decision_replay',
      philosophy: 'TD E2E 回放',
      approach: liveDecisionReplay
        ? 'E2EReplayService + TripDecisionEngineService (live)'
        : 'E2EReplayService + fixture mock',
      emphasis: 'decision engine truth',
      risk: liveDecisionReplay ? 'medium' : 'low',
    };

    for (let round = 0; round < maxRounds; round++) {
      const runs: StrategyRunResult[] = [];
      let strategiesTested: string[] = [];

      if (evalMode === 'decision_replay' && evalCtx.sourceE2eCaseId) {
        const trajectory = await this.evaluator.runReplayTrajectory(currentSkill, evalCtx);
        const score = await this.evaluator.score(trajectory, currentSkill, evalCtx);
        trajectory.score = score;
        this.store.save(trajectory);
        runs.push({ strategy: decisionReplayStrategy, trajectory, score });
        strategiesTested = [decisionReplayStrategy.strategyId];
      } else {
        const strategies = await this.explorer.generate(currentSkill, tasks, k);
        strategiesTested = strategies.map((s) => s.strategyId);
        for (const strategy of strategies) {
          const trajectory = await this.executor.run(currentSkill, strategy, tasks, evalCtx);
          const score = await this.evaluator.score(trajectory, currentSkill, evalCtx);
          trajectory.score = score;
          this.store.save(trajectory);
          runs.push({ strategy, trajectory, score });
        }
      }

      const best = runs.reduce((a, b) => (a.score >= b.score ? a : b));
      const worst = runs.reduce((a, b) => (a.score <= b.score ? a : b));
      const roundMeta: EvolutionRoundResult = {
        round: round + 1,
        strategiesTested,
        bestScore: best.score,
        worstScore: worst.score,
        improved: false,
      };

      const explorationBeatBaseline = best.score > bestScore + minDelta - 0.001;
      const shouldForceEdit =
        forceEditWhenStuck &&
        !explorationBeatBaseline &&
        bestScore < forceEditBelowScore - 0.001;

      if (!explorationBeatBaseline && !shouldForceEdit) {
        noImproveStreak += 1;
        roundMeta.skippedReason = '探索未超过当前最佳';
        rounds.push(roundMeta);
        if (noImproveStreak >= stopAfterNoImprove) break;
        continue;
      }

      if (shouldForceEdit) {
        roundMeta.forcedEdit = true;
        this.logger.log(
          `[MetaSkillEngine] round ${round + 1}: force edit (score=${bestScore} < ${forceEditBelowScore})`,
        );
      }

      const baselineTraj =
        baselineEval.trajectories.reduce((a, b) =>
          (a.score ?? 0) <= (b.score ?? 0) ? a : b,
        ) ?? best.trajectory;
      const contrastBest = best.trajectory;
      const contrastWorst =
        worst.score < best.score - 0.001 ? worst.trajectory : baselineTraj;
      const failedAssertions = this.evaluator.describeFailedAssertions(
        baselineTraj,
        currentSkill,
        evalCtx,
      );

      const delta = await this.analyzer.analyze(
        contrastBest,
        contrastWorst,
        currentSkill,
        failedAssertions.length ? failedAssertions : undefined,
      );
      let proposed = await this.editor.edit(currentSkill, delta);
      proposed = ensureSkillBodyAssertions(proposed, assertions);

      const auditOpts = {
        relaxed: !!options.seedId || evalMode === 'fixture' || evalMode === 'decision_replay',
      };
      let auditResult = await this.auditor.audit(proposed, currentSkill, auditOpts);
      if (!auditResult.passed) {
        proposed = ensureSkillBodyAssertions(
          await this.editor.fixAuditIssues(proposed, auditResult.issues),
          assertions,
        );
        auditResult = await this.auditor.audit(proposed, currentSkill, auditOpts);
      }
      roundMeta.auditPassed = auditResult.passed;

      if (!auditResult.passed) {
        roundMeta.skippedReason = '审计未通过';
        rounds.push(roundMeta);
        noImproveStreak += 1;
        if (noImproveStreak >= stopAfterNoImprove) break;
        continue;
      }

      const candidateEval = await this.evaluator.evaluateSkillOnBatch(proposed, tasks, evalCtx);
      const batchComparison = this.batchComparator.compareBatches(
        this.batchComparator.scoresFromTrajectories(baselineEval.trajectories, tasks),
        this.batchComparator.scoresFromTrajectories(candidateEval.trajectories, tasks),
      );
      lastBatchComparison = batchComparison;

      if (useRegressionGate) {
        const scalarGate = this.regressionGate.check({
          baselineScore: bestScore,
          candidateScore: candidateEval.avgScore,
          minScoreDelta: minDelta,
          auditPassed: auditResult.passed,
        });
        const batchGate = this.batchComparator.passesGate(batchComparison, minDelta);
        const passed = scalarGate.passed && batchGate.passed;
        roundMeta.regressionGatePassed = passed;
        if (!passed && !dryRun) {
          roundMeta.skippedReason = `回归门禁: ${[...scalarGate.reasons, ...batchGate.reasons].join('; ')}`;
          rounds.push(roundMeta);
          noImproveStreak += 1;
          if (noImproveStreak >= stopAfterNoImprove) break;
          continue;
        }
      }

      if (candidateEval.avgScore > bestScore || (dryRun && batchComparison.improved)) {
        const oldVersion = currentSkill.version;
        if (!dryRun) {
          this.registry.save(proposed, {
            scoreDelta: candidateEval.avgScore - bestScore,
            strategiesTested: roundMeta.strategiesTested,
            auditPassed: true,
            evalMode,
          });
          currentSkill = this.registry.load(skillId, options.artifactType);
          const refreshed = await this.evaluator.evaluateSkillOnBatch(currentSkill, tasks, evalCtx);
          baselineEval.trajectories = refreshed.trajectories;
        } else {
          currentSkill = proposed;
        }
        bestScore = candidateEval.avgScore;
        noImproveStreak = 0;
        roundMeta.improved = true;
        roundMeta.newVersion = currentSkill.version;
        this.logger.log(
          `[MetaSkillEngine] round ${round + 1}: v${oldVersion}->v${currentSkill.version} score=${bestScore} batchΔ=${batchComparison.scoreDelta}`,
        );
      } else {
        roundMeta.skippedReason = '验证批次未提升';
        noImproveStreak += 1;
      }

      rounds.push(roundMeta);
      if (noImproveStreak >= stopAfterNoImprove) break;
    }

    const improved = bestScore > initialScore || currentSkill.version > initialVersion;
    let agentSkillsExport: EvolutionResult['agentSkillsExport'];
    if (
      options.exportAgentSkills &&
      !dryRun &&
      improved &&
      this.agentSkillsInterop
    ) {
      try {
        const exported = this.agentSkillsInterop.export(
          [skillId],
          options.exportAgentSkillsRoot,
        );
        agentSkillsExport = {
          exportRoot: exported.exportRoot,
          records: exported.records.map((r) => ({
            tripnaraSkillId: r.tripnaraSkillId,
            agentSkillsName: r.agentSkillsName,
            exportDir: r.exportDir,
          })),
        };
      } catch (err) {
        this.logger.warn(
          `[MetaSkillEngine] Agent Skills export failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return {
      skillId,
      artifactType: currentSkill.artifactType,
      initialVersion,
      finalVersion: currentSkill.version,
      initialScore,
      finalScore: bestScore,
      evalMode,
      rounds,
      skill: currentSkill,
      lastBatchComparison,
      agentSkillsExport,
    };
  }
}
