/**
 * Stable env subset for CGUS replay report `configHash`（scripts-only，无 Nest）。
 *
 * ## `configHash` 输入克制规则（团队约定，防 hash 失真）
 *
 * **只纳入会改变 replay / CGUS 数值结果的字段。** 下列类型 **禁止** 进入传给 `buildConfigHash` 的对象：
 *
 * - 输出路径、报告文件名、`verbose`、仅影响 stdout 的说明
 * - 调试开关、日志级别、仅审计展示用的 schema 装饰字段
 * - 任何「读起来有用但不改变 search 行为」的元数据
 *
 * 需要记录上述信息时：放在报告其它字段（如 `env`、`meta`），**不要**合并进 `configForHash`。
 *
 * **新增键（PR 必备）**：每增加一个进入 `configForHash` 的字段，必须在 review 中写清一句
 * **「为什么它会改变数值结果」**（改变 E[U]、排序、MC 门控、候选池等）；否则默认拒绝合并。
 */

export interface ReplayConfigForHash {
  /** 决定走 lite / app / fixtures 哪条 CGUS 路径及默认分支 → 改变 search 与 hash 语义。 */
  suiteMode: string | null;
  /** stress / stress_weather 等会 patch 候选与 rollout 开关 → 直接改变可行集与 rollout 值。 */
  suiteProfile: string | null;
  /** 合成用例数量与循环构造的 DSO 模式 → 改变输入分布与聚合指标。 */
  suiteN: number | null;
  /** 是否启用 MC rerank 及最终排序权 → 改变 winner / topN。 */
  mcRerankEnabled: boolean;
  /** 边际软门控阈值 → 改变是否允许 MC 翻盘。 */
  minTopMargin: number | null;
  /** 每候选 MC 样本下限 → 不满足则 rerank 不可eligible，改变排序结论。 */
  minSamplesPerCandidate: number | null;
  /** Top 置信区间宽度上限 → 影响 rerank 资格与最终序。 */
  maxTopCiWidth: number | null;
  /** rank authority / rankReplaySnapshot 的 topN 窗口 → 改变观测到的 topN 与诊断。 */
  compareTopN: number | null;
  /** MC 采样次数 → 改变 E[U] 估计与方差，进而改变排序。 */
  monteCarloSamples: number | null;
  /** 候选池上限 → 改变搜索空间与得分。 */
  cgusMaxCandidates: number | null;
  /** rollout 分支因子 → 改变 rollout 后验与 finalScore。 */
  cgusRolloutTopK: number | null;
  /** pilot 方差分配样本 → 改变采样预算分配与 MC 输出。 */
  cgusPilotSamples: number | null;
  /** 确定性平局规则（如按 id）→ tie 时改变排序稳定序。 */
  deterministicTieBreaker: string;
  /**
   * app 模式下由 DecisionOSConfig 解析出的数值子集；覆盖 env 默认 → 改变实际 MC/池参数。
   * **为何改变数值**：与 `monteCarloSamples` 等字段同源，表示运行期生效值。
   */
  appDecisionCgusSubset?: Record<string, unknown> | null;
}

function readNumberEnv(name: string): number | null {
  const raw = process.env[name];
  if (!raw || !raw.trim()) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export type ReplayConfigForHashRuntimeOverrides = Pick<
  ReplayConfigForHash,
  'suiteMode' | 'suiteProfile' | 'suiteN'
>;

/**
 * 只放“影响 replay 结果”的配置。
 * 不要放输出目录、verbose、日志开关、generatedAt 等字段。
 *
 * `runtime` 传入本次 run 实际解析的 mode/profile/N（避免仅读 env 与默认值漂移）。
 */
export function pickReplayConfigForHash(runtime?: ReplayConfigForHashRuntimeOverrides): ReplayConfigForHash {
  return {
    suiteMode: runtime?.suiteMode ?? process.env.CGUS_SUITE_MODE?.trim() ?? null,
    suiteProfile: runtime?.suiteProfile ?? process.env.CGUS_SUITE_PROFILE?.trim() ?? null,
    suiteN: runtime?.suiteN ?? readNumberEnv('CGUS_SUITE_N'),
    mcRerankEnabled: String(process.env.KERNEL_CGUS_MC_RERANK_ENABLED ?? '').toLowerCase() === 'true',
    minTopMargin: readNumberEnv('KERNEL_CGUS_MC_RERANK_MIN_TOP_MARGIN'),
    minSamplesPerCandidate: readNumberEnv('KERNEL_CGUS_MC_RERANK_MIN_SAMPLES'),
    maxTopCiWidth: readNumberEnv('KERNEL_CGUS_MC_RERANK_MAX_TOP_CI_WIDTH'),
    compareTopN: readNumberEnv('KERNEL_CGUS_MC_RERANK_COMPARE_TOPN'),
    monteCarloSamples: readNumberEnv('MONTE_CARLO_SAMPLES'),
    cgusMaxCandidates: readNumberEnv('CGUS_MAX_CANDIDATES'),
    cgusRolloutTopK: readNumberEnv('CGUS_ROLLOUT_TOPK'),
    cgusPilotSamples: readNumberEnv('CGUS_PILOT_SAMPLES'),
    deterministicTieBreaker: 'id',
  };
}

const CGUS_NUMERIC_SNAPSHOT_KEYS = [
  'monteCarloSamples',
  'cgusMaxCandidates',
  'cgusRolloutTopK',
  'cgusPilotSamples',
] as const;

function pickCgusNumericFields(snapshot: unknown): Record<string, unknown> | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const s = snapshot as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of CGUS_NUMERIC_SNAPSHOT_KEYS) {
    if (typeof s[k] === 'number' && Number.isFinite(s[k] as number)) {
      out[k] = s[k];
    }
  }
  return Object.keys(out).length ? out : null;
}

/** lite 分支写入的 `configSnapshot`（与 env 解析一致后的实际值）。 */
export function pickLiteCgusSnapshotForHash(snapshot: unknown): Record<string, unknown> | null {
  return pickCgusNumericFields(snapshot);
}

/**
 * 从 `DecisionOSConfigService.get('decision')` 的快照中抽取与 CGUS suite 相关的字段。
 */
export function pickAppDecisionCgusSubset(snapshot: unknown): Record<string, unknown> | null {
  return pickCgusNumericFields(snapshot);
}

/**
 * 合并 env 层与 app 解析层，供 `buildConfigHash` 使用。
 */
export function mergeReplayConfigForHash(
  base: ReplayConfigForHash,
  appSubset: Record<string, unknown> | null | undefined,
): ReplayConfigForHash {
  if (!appSubset || Object.keys(appSubset).length === 0) {
    return { ...base, appDecisionCgusSubset: null };
  }
  return {
    ...base,
    monteCarloSamples:
      typeof appSubset.monteCarloSamples === 'number' ? appSubset.monteCarloSamples : base.monteCarloSamples,
    cgusMaxCandidates:
      typeof appSubset.cgusMaxCandidates === 'number' ? appSubset.cgusMaxCandidates : base.cgusMaxCandidates,
    cgusRolloutTopK:
      typeof appSubset.cgusRolloutTopK === 'number' ? appSubset.cgusRolloutTopK : base.cgusRolloutTopK,
    cgusPilotSamples:
      typeof appSubset.cgusPilotSamples === 'number' ? appSubset.cgusPilotSamples : base.cgusPilotSamples,
    appDecisionCgusSubset: appSubset,
  };
}

export type TdFixtureMcRankAuthorityForHash = {
  rerankEnabled: boolean;
  minSamplesPerCandidate: number;
  maxTopCiWidth?: number;
  minTopMargin: number;
  compareTopN: number;
};

/**
 * TD engine-dso fixture replay（`replay-cgus-real-fixtures.ts`）专用：纳入脚本内硬编码 rollout 等，
 * 避免与 suite 的 lite/app 路径混用同一套 env 默认值却不同语义。
 */
export function buildTdFixtureReplayConfigForHash(input: {
  fixtureCount: number;
  monteCarloSamplesUsed: number;
  maxCandidates: number;
  mcRankAuthority: TdFixtureMcRankAuthorityForHash;
  decisionCgusSubset?: Record<string, unknown> | null;
}): unknown {
  const base = mergeReplayConfigForHash(
    pickReplayConfigForHash({
      suiteMode: 'fixtures',
      suiteProfile: 'td-replay-fixtures',
      suiteN: input.fixtureCount,
    }),
    input.decisionCgusSubset ?? null,
  );
  // 下列键均进入 configForHash；每项须满足「为何改变数值结果」——与 suite 路径对齐时可审本注释。
  return {
    ...base,
    /** 区分 TD fixture 脚本与 suite → 硬编码 rollout/候选逻辑不同，数值必不同。 */
    replayScript: 'replay-cgus-real-fixtures',
    /** 矩阵子集 env → 改变 fixture 集合与 case 输入。 */
    tdReplayMatrixId: process.env.TD_REPLAY_MATRIX_ID?.trim() || null,
    /** 传入 `cgus.search` 的 sampleSize → 改变 MC 估计与排序。 */
    monteCarloSamplesUsed: input.monteCarloSamplesUsed,
    /** `buildLiteCandidates` 上限 → 改变候选池与得分。 */
    maxCandidates: input.maxCandidates,
    /** 本脚本固定开启 rollout → 改变 finalScore / 排序 vs 无 rollout。 */
    useWorldModelRollout: true,
    /** rollout 分支宽度 → 改变多步后验。 */
    rolloutTopK: 3,
    /** rollout 深度 → 改变后验轨迹长度。 */
    rolloutHorizonSteps: 3,
    /** 探索项关闭为 0 → 固定与 suite 某分支的相对行为。 */
    explorationBeta: 0,
    /** MC rerank 门控参数 → 改变 winner / topN。 */
    mcRankAuthority: input.mcRankAuthority,
  };
}
