/** PR-A：在线 DecisionTrajectory 采集开关（默认关闭，避免未迁移环境写库失败）。 */
export function isDecisionTrajectoryCaptureEnabled(): boolean {
  const v = process.env.DECISION_TRAJECTORY_ENABLED?.trim();
  return v === '1' || v === 'true';
}
