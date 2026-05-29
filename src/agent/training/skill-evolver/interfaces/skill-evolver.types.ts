/** SkillEvolver Lite — 文本 Markdown 技能与进化循环类型 */

export type EvolvableArtifactType = 'markdown_skill' | 'country_pack';

/** llm：LLM 多维度；fixture：断言+LLM 轨迹；decision_replay：TD E2E 回放 + skill 断言 */
export type SkillEvolverEvalMode = 'llm' | 'fixture' | 'decision_replay';

export interface SkillFrontmatter {
  skill_id: string;
  name: string;
  version: number;
  created_at?: string;
  updated_at?: string;
  parent_version?: number;
  tags?: string[];
  applicable_scenarios?: string[];
  artifact_type?: EvolvableArtifactType;
  country_code?: string;
}

export interface EvolvableSkill {
  skillId: string;
  name: string;
  version: number;
  parentVersion?: number;
  content: string;
  body: string;
  frontmatter: SkillFrontmatter;
  tags: string[];
  applicableScenarios: string[];
  filePath: string;
  artifactType: EvolvableArtifactType;
  countryCode?: string;
}

export interface ExplorationStrategy {
  strategyId: string;
  philosophy: string;
  approach: string;
  emphasis: string;
  risk: string;
}

export interface SkillEvolverTask {
  id: string;
  description: string;
  initialObservation: string;
  /** 可选：期望完成信号（关键词或断言描述） */
  successCriteria?: string;
  optimalSteps?: number;
}

export interface ReplayAssertion {
  type: 'trajectory_contains' | 'skill_body_contains' | 'task_completed' | 'action_contains';
  value: string;
  weight?: number;
}

export interface ReplayCaseFixture {
  caseId: string;
  description?: string;
  /** 来源 E2E case id（导出脚本写入） */
  source_e2e_case_id?: string;
  tasks: SkillEvolverTask[];
  assertions?: ReplayAssertion[];
}

export interface TaskBatchFile {
  batchId: string;
  description?: string;
  tasks: SkillEvolverTask[];
  assertions?: ReplayAssertion[];
}

export interface TrajectoryStep {
  stepIndex: number;
  observation: string;
  thought?: string;
  action: string;
  result: string;
  isError?: boolean;
  isRecovery?: boolean;
  timestamp: string;
}

export interface SkillTrajectory {
  trajectoryId: string;
  skillId: string;
  skillVersion: number;
  strategyId?: string;
  strategy?: ExplorationStrategy;
  taskIds: string[];
  steps: TrajectoryStep[];
  taskCompleted: boolean;
  score?: number;
  skillContentSnapshot?: string;
  evalMode?: SkillEvolverEvalMode;
  fixtureCaseId?: string;
  /** decision_replay 时 E2EReplayService 是否通过 */
  decisionReplayPassed?: boolean;
  /** decision_replay 是否使用真实 TripDecisionEngine（非 fixture mock） */
  liveDecisionReplay?: boolean;
  decisionReplayDiffSummary?: string;
  createdAt: string;
}

export interface ContrastiveDelta {
  successFactors: string[];
  rootCauses: string[];
  skillAdditions: string[];
  skillModifications: string[];
  skillDeletions: string[];
  emphasisItems: string[];
  executionLapses: string[];
}

export type AuditSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface AuditIssue {
  ruleId: string;
  severity: AuditSeverity;
  status: 'PASS' | 'FAIL' | 'WARNING';
  description: string;
}

export interface AuditResult {
  passed: boolean;
  issues: AuditIssue[];
  rawResponse?: string;
}

export interface StrategyRunResult {
  strategy: ExplorationStrategy;
  trajectory: SkillTrajectory;
  score: number;
}

export interface EvolutionRoundResult {
  round: number;
  strategiesTested: string[];
  bestScore: number;
  worstScore: number;
  improved: boolean;
  auditPassed?: boolean;
  regressionGatePassed?: boolean;
  newVersion?: number;
  skippedReason?: string;
  /** 探索未涨分但低于 forceEditBelowScore 时触发的强制编辑 */
  forcedEdit?: boolean;
}

export interface EvolutionResult {
  skillId: string;
  artifactType: EvolvableArtifactType;
  initialVersion: number;
  finalVersion: number;
  initialScore: number;
  finalScore: number;
  evalMode: SkillEvolverEvalMode;
  rounds: EvolutionRoundResult[];
  skill: EvolvableSkill;
  lastBatchComparison?: SkillTrajectoryBatchComparison;
  agentSkillsExport?: {
    exportRoot: string;
    records: Array<{ tripnaraSkillId: string; agentSkillsName: string; exportDir: string }>;
  };
}

export interface SkillEvolverEvalContext {
  mode: SkillEvolverEvalMode;
  assertions?: ReplayAssertion[];
  fixtureCaseId?: string;
  /** 对接 TD_REPLAY registry 的 E2E case id */
  sourceE2eCaseId?: string;
  /** true：真实引擎回放，评分以 fixture 断言为主 */
  liveDecisionReplay?: boolean;
}

export interface EvolveSkillOptions {
  maxRounds?: number;
  strategyCount?: number;
  minScoreDelta?: number;
  noImprovementStopRounds?: number;
  dryRun?: boolean;
  requestId?: string;
  evalMode?: SkillEvolverEvalMode;
  /** 相对 data/skill-evolver/tasks/{id}.json */
  taskBatchId?: string;
  /** 相对 data/skill-evolver/replay-cases/{id}.json */
  replayCaseId?: string;
  /** 合并前是否跑回归门禁（默认 true，dryRun 时忽略写盘门禁） */
  regressionGate?: boolean;
  artifactType?: EvolvableArtifactType;
  /** 非 dry-run 且技能有改进时，自动导出 Agent Skills（默认 false） */
  exportAgentSkills?: boolean;
  exportAgentSkillsRoot?: string;
  /** 低于该分数且探索未涨分时，仍强制进入 contrastive edit（默认 100） */
  forceEditBelowScore?: number;
  /** 是否启用「探索卡住时强制编辑」（默认 true） */
  forceEditWhenStuck?: boolean;
  /** 从 data/skill-evolver/seeds/{skillId}.{seedId}.md 加载初始 skill（不写盘，仅本次 evolve） */
  seedId?: string;
  /** 有 source_e2e_case_id 时默认走 decision_replay（可用 false 关闭） */
  useDecisionReplay?: boolean;
  /** 使用真实 TripDecisionEngine（SKILL_EVOLVER_LIVE_DECISION_REPLAY 或本字段） */
  liveDecisionReplay?: boolean;
  /** 进化成功后同步 country_pack Markdown 到 ReadinessPack DB */
  syncReadinessPack?: boolean;
  verbose?: boolean;
}

export interface SkillEvolverRegressionGateResult {
  passed: boolean;
  reasons: string[];
}

export interface TrajectoryBatchScore {
  taskId: string;
  score: number;
  taskCompleted: boolean;
  trajectoryId: string;
}

export interface SkillTrajectoryBatchComparison {
  baselineAvgScore: number;
  candidateAvgScore: number;
  scoreDelta: number;
  baselineSuccessRate: number;
  candidateSuccessRate: number;
  improved: boolean;
  perTask: Array<{
    taskId: string;
    baselineScore: number;
    candidateScore: number;
    delta: number;
  }>;
  tauPlus: TrajectoryBatchScore | null;
  tauMinus: TrajectoryBatchScore | null;
}

export interface SkillRegistryEntry {
  name: string;
  currentVersion: number;
  versions: number[];
  artifactType?: EvolvableArtifactType;
  countryCode?: string;
  successRate?: number;
  lastEvaluated?: string;
  evolutionCount?: number;
}

export interface SkillRegistryFile {
  skills: Record<string, SkillRegistryEntry>;
  evolution_history: Array<{
    skill_id: string;
    from_version: number;
    to_version: number;
    timestamp: string;
    score_delta: number;
    audit_passed: boolean;
    strategies_tested: string[];
    eval_mode?: SkillEvolverEvalMode;
  }>;
}
