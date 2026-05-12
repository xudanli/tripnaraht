/**
 * Planning / replacement POI 检索的可观测性载荷（Retrieval Contract v1）。
 * lookup（如仅 opening_hours 按名反查）应使用 retrievalKind: 'lookup' 或单独字段，避免与行程检索 telemetry 混写。
 */
import type { ItineraryGap, ItineraryGapType } from './itinerary-gap.types';
import type { RetrievalCauseEvent } from './retrieval-cause-event.types';

export type { RetrievalCauseEvent, RetrievalCauseEventType } from './retrieval-cause-event.types';

export type RetrievalKind = 'planning' | 'replacement' | 'lookup';

/** 缺口结构统计（analytics / replay；与 `semanticGaps` 同写入，避免扫全量对象） */
export interface RetrievalGapStats {
  primaryGap: ItineraryGapType;
  allGaps?: ItineraryGapType[];
}

export interface RetrievalDecisionTrace {
  /** 与「认知层」对齐：planning=行程候选；replacement=世界突变后补点；lookup=验证/元数据 */
  retrievalKind: RetrievalKind;
  /** 主展示用：多路检索时可由 scenic|general 等拼接 */
  query: string;
  /** 各路 poi.search 的完整 query，便于回答「为什么召回这些点」 */
  subQueries?: Record<string, string>;
  contextualSignals: {
    pacing?: string;
    weather?: string;
    fatigue?: number;
    novelty?: number;
  };
  penalties: {
    /** DSO exclude +（replacement 时）闭馆点等硬排除 id */
    rejected: string[];
    /** 草案已选 place/poi id（影响检索后缀与 POI_SELECTION 降权） */
    selected: string[];
    /** 符号化说明；规划阶段可为 deferred，POI_SELECTION 后写入 applied 规则 */
    diversity: string[];
  };
  /**
   * **仅** `replacement_retrieval_trace`：外部世界变化迫使本次检索（为何触发）。
   * `retrievalReason` 表示本次检索的策略/意图（想解决什么）；二者不同层，勿混写。
   */
  causedByEvent?: RetrievalCauseEvent;
  /** 规则检测到的体验语义缺口（v1）；与 `retrievalReason` 对齐 gap→intent */
  semanticGaps?: ItineraryGap[];
  /** 与 `semanticGaps` 同步的轻量统计维度（便于聚合，不必解析数组） */
  gapStats?: RetrievalGapStats;
  retrievalReason?: string;
  /** ISO-8601，便于与 decision_log 对齐因果序 */
  ts?: string;
  /** reject 过滤后的合并候选数（可选，供 gap / 空池分析） */
  mergedPoiCount?: number;
}
