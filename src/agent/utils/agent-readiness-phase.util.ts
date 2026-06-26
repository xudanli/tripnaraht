import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { getTripReadinessPhase } from '../../trips/readiness/utils/trip-readiness-relevance.util';

/** 与 route_and_run 行程全面分析 fast path 共用的话术 */
export const AGENT_TRIP_COMPREHENSIVE_ANALYSIS_RE =
  /(全面分析|分析当前行程|看看.*问题|优化.*行程|行程.*优化|还有什么问题|可以优化)/i;

export function isAgentTripComprehensiveAnalysisMessage(message: string): boolean {
  return AGENT_TRIP_COMPREHENSIVE_ANALYSIS_RE.test(message.trim());
}

/**
 * 智能体统一入口在「规划阶段」不运行 Readiness Pack 规则引擎（blockers/must/should）。
 * 规划期聚焦：日程、预算、交通、行前任务与打包清单；Pack 准备度留给临行前窗口。
 */
export function shouldSkipAgentReadinessPackCheck(
  request: Pick<RouteAndRunRequestDto, 'options' | 'conversation_context' | 'trip_id'>,
  tripStartDate?: Date | null,
  message?: string,
): boolean {
  const msg = (message ?? '').trim();

  if (request.conversation_context?.context_type?.trim() === 'active_trip_summary') {
    return true;
  }

  if (request.trip_id?.trim() && msg && isAgentTripComprehensiveAnalysisMessage(msg)) {
    return true;
  }

  const entry = request.options?.entry_point;
  if (entry === 'planning_workbench') {
    return true;
  }

  const intent = request.options?.intent_mode;
  if (intent === 'TRIP_PLANNING') {
    return true;
  }

  const runtimePhase = request.options?.agentic_runtime_planning_phase?.trim().toLowerCase();
  if (runtimePhase === 'planning') {
    return true;
  }

  if (tripStartDate && getTripReadinessPhase(tripStartDate) === 'planning') {
    return true;
  }

  return false;
}

/** 从 active_trip_summary / 轻量 QA 注入块解析 `开始日期: YYYY-MM-DD` 或 `开始: YYYY-MM-DD` */
export function parseTripStartDateFromContextLines(lines: readonly string[]): Date | undefined {
  for (const line of lines) {
    const m = line.match(/(?:开始日期|开始):\s*(\d{4}-\d{2}-\d{2})/);
    if (m?.[1]) {
      const d = new Date(m[1]);
      if (!Number.isNaN(d.getTime())) {
        return d;
      }
    }
  }
  return undefined;
}

/** 过滤 TripInsight 中与 Readiness Pack 相关的 findings（规划阶段展示用） */
export function filterScheduleFocusedInsightFindings<T extends { title?: string; message?: string; type?: string }>(
  findings: T[],
): T[] {
  return findings.filter((f) => {
    if (f.type === 'positive') return false;
    const blob = `${f.title ?? ''}${f.message ?? ''}`;
    return !/必须处理项|阻塞项|readiness|准备度|blocker|级联影响|三人格/i.test(blob);
  });
}

/** 行程进度/概览类问法在规划阶段使用的 Prompt 结构（不含 Readiness Pack） */
export function buildPlanningPhaseTripOverviewPromptLines(): string[] {
  return [
    '【行程进度/概览问法 · 规划阶段】用户关心当前草稿的整体状态（日程、预算、交通、行前任务与打包清单），而非 Readiness Pack 阻塞项。',
    '请按以下结构组织回答（小标题可用 `-` 或加粗，保持简洁）：',
    '- **当前摘要**：一句话说明行程覆盖的核心区域/城市或路线主轴。',
    '- **日程与交通**：基于草案判断单日强度、驾驶/衔接是否合理；点名过密、绕路或缓冲不足之处。',
    '- **预算**：若上下文有预算口径或估算，概括总盘与主要类目；若无数据，说明缺口并给合理假设区间。',
    '- **住宿与餐饮**：是否已体现过夜城镇与用餐时段；缺口须明确写出，勿编造预订记录。',
    '- **行前任务与打包**：列出 2～4 条与当前草案相关的待办（证件、预订、装备/打包清单项）；勿展开 Pack 规则引擎 blockers/must 计数。',
    '- **优先优化点**：直接给出可执行的改法；若无明显硬伤，写「未发现明显硬伤」。',
    '【Dashboard 强约束】此类问法且已绑定行程时：`<<<CONSULTATION_UI_JSON>>>` 块**禁止省略**；`summary_cards` 至少 4 张，语义分别覆盖：**预算区间与口径**、**驾驶或日程强度/松紧**、**核心游览区域或主轴**、**最大优化点或待办**（勿用 Readiness Pack 分数卡）。',
  ];
}
