import { Injectable, Logger } from '@nestjs/common';
import type {
  SkillEvolverTask,
  SkillTrajectory,
  SkillTrajectoryBatchComparison,
  TrajectoryBatchScore,
} from '../interfaces/skill-evolver.types';

/**
 * SkillEvolver 版 batch τ+/τ− 对比（对齐 ReplayComparator 思想，用于文本技能而非 RL policy）。
 */
@Injectable()
export class SkillEvolverBatchComparatorService {
  private readonly logger = new Logger(SkillEvolverBatchComparatorService.name);

  scoresFromTrajectories(trajectories: SkillTrajectory[], tasks: SkillEvolverTask[]): TrajectoryBatchScore[] {
    const byTask = new Map<string, SkillTrajectory>();
    for (const t of trajectories) {
      const taskId = t.taskIds[0] ?? t.trajectoryId;
      if (!byTask.has(taskId) || (t.score ?? 0) > (byTask.get(taskId)!.score ?? 0)) {
        byTask.set(taskId, t);
      }
    }
    return tasks.map((task) => {
      const traj = byTask.get(task.id);
      return {
        taskId: task.id,
        score: traj?.score ?? 0,
        taskCompleted: traj?.taskCompleted ?? false,
        trajectoryId: traj?.trajectoryId ?? '',
      };
    });
  }

  compareBatches(
    baselineScores: TrajectoryBatchScore[],
    candidateScores: TrajectoryBatchScore[],
  ): SkillTrajectoryBatchComparison {
    const perTask = baselineScores.map((b) => {
      const c = candidateScores.find((x) => x.taskId === b.taskId);
      return {
        taskId: b.taskId,
        baselineScore: b.score,
        candidateScore: c?.score ?? 0,
        delta: (c?.score ?? 0) - b.score,
      };
    });

    const baselineAvg =
      baselineScores.length > 0
        ? baselineScores.reduce((s, x) => s + x.score, 0) / baselineScores.length
        : 0;
    const candidateAvg =
      candidateScores.length > 0
        ? candidateScores.reduce((s, x) => s + x.score, 0) / candidateScores.length
        : 0;

    const baselineSuccessRate =
      baselineScores.filter((x) => x.taskCompleted).length / Math.max(baselineScores.length, 1);
    const candidateSuccessRate =
      candidateScores.filter((x) => x.taskCompleted).length / Math.max(candidateScores.length, 1);

    const allScores = [...baselineScores, ...candidateScores];
    const tauPlus = allScores.reduce<TrajectoryBatchScore | null>(
      (best, cur) => (!best || cur.score > best.score ? cur : best),
      null,
    );
    const tauMinus = allScores.reduce<TrajectoryBatchScore | null>(
      (worst, cur) => (!worst || cur.score < worst.score ? cur : worst),
      null,
    );

    const comparison: SkillTrajectoryBatchComparison = {
      baselineAvgScore: Math.round(baselineAvg * 100) / 100,
      candidateAvgScore: Math.round(candidateAvg * 100) / 100,
      scoreDelta: Math.round((candidateAvg - baselineAvg) * 100) / 100,
      baselineSuccessRate: Math.round(baselineSuccessRate * 1000) / 1000,
      candidateSuccessRate: Math.round(candidateSuccessRate * 1000) / 1000,
      improved: candidateAvg > baselineAvg,
      perTask,
      tauPlus,
      tauMinus,
    };

    this.logger.log(
      `[BatchComparator] baseline=${comparison.baselineAvgScore} candidate=${comparison.candidateAvgScore} delta=${comparison.scoreDelta}`,
    );
    return comparison;
  }

  /** 候选版本是否相对 baseline 有净提升且未显著降低成功率 */
  passesGate(
    comparison: SkillTrajectoryBatchComparison,
    minScoreDelta: number,
    maxSuccessRateDrop = 0.05,
  ): { passed: boolean; reasons: string[] } {
    const reasons: string[] = [];
    if (comparison.scoreDelta < minScoreDelta) {
      reasons.push(`batch scoreDelta ${comparison.scoreDelta} < ${minScoreDelta}`);
    }
    const successDrop = comparison.baselineSuccessRate - comparison.candidateSuccessRate;
    if (successDrop > maxSuccessRateDrop) {
      reasons.push(`successRate dropped by ${successDrop.toFixed(3)}`);
    }
    const regressed = comparison.perTask.filter((p) => p.delta < -5);
    if (regressed.length > comparison.perTask.length / 2) {
      reasons.push(`${regressed.length}/${comparison.perTask.length} tasks regressed >5pts`);
    }
    return { passed: reasons.length === 0, reasons };
  }
}
