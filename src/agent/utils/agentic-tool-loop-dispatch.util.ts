import type { RoutingSignals } from './orchestration-signals.util';

/**
 * FEATURE_AGENTIC_TOOL_LOOP：判定是否为「基础设施层」轻量咨询（天气、基础事实），适合原生 MCP 工具链快路径。
 *
 * 说明：与 TaskType 中的 DOMAIN 枚举不同名；此处用语义近似 INFRASTRUCTURE（传感器 / 事实检索）。
 */
export function isInfrastructureFastTrackCandidate(signals: RoutingSignals, message: string): boolean {
  if (signals.complexity !== 'SIMPLE') return false;

  const blockedTaskTypes = new Set([
    'TRIP_PLANNING',
    'BOOKING_WORKFLOW',
    'CRUD',
    'CUSTOMER_SUPPORT',
  ]);
  if (blockedTaskTypes.has(signals.taskType)) return false;

  const msg = message.trim();
  if (!msg || msg.length > 480) return false;

  const allowedTask =
    signals.taskType === 'DATA_LOOKUP' ||
    signals.taskType === 'GENERIC_QA' ||
    signals.taskType === 'RAG_QA';

  if (!allowedTask) return false;

  const infraWeather =
    /天气|气温|下雨|降雨|预报|台风|风速|湿度|下雪|weather|forecast|rain|temperature|humidity|snow|celsius|°c|fahrenheit/i.test(
      msg,
    );

  const infraTimeZone = /时区|timezone|utc|gmt|几点了|现在几点|what\s*time\b/i.test(msg);

  return infraWeather || infraTimeZone;
}

export function parseAgenticToolLoopFlag(raw?: string | null): boolean {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

/** FEATURE_AGENTIC_RUNTIME_MCP_CAP：在审计白名单之后按相位（及应急约束）再收窄 LLM 可见 MCP 工具面。 */
export function parseAgenticRuntimeMcpCapFlag(raw?: string | null): boolean {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

/** FEATURE_TASK_CLOSURE_BOOKING：agentic 路径启用 booking Task Closure（Proposal→Policy→Execute）。 */
export function parseFeatureTaskClosureBooking(raw?: string | null): boolean {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

/** AGENTIC_TOOL_LOOP_TOOL_PACKS=weather,exa,hotel,calendar */
export function parseAgenticToolPacksEnv(
  raw?: string | null,
): Array<'weather' | 'exa' | 'hotel' | 'calendar'> | null {
  if (!raw || !String(raw).trim()) return null;
  const allowed = new Set(['weather', 'exa', 'hotel', 'calendar']);
  const out: Array<'weather' | 'exa' | 'hotel' | 'calendar'> = [];
  for (const p of String(raw).split(',')) {
    const k = p.trim().toLowerCase();
    if (allowed.has(k)) out.push(k as 'weather' | 'exa' | 'hotel' | 'calendar');
  }
  return out.length > 0 ? out : null;
}

/**
 * 未配置 AGENTIC_TOOL_LOOP_TOOL_PACKS 时，按用户措辞追加搜索 / 住宿包。
 */
export function inferDefaultAgenticToolPacks(message: string): Array<'weather' | 'exa' | 'hotel'> {
  const msg = message.toLowerCase();
  const packs: Array<'weather' | 'exa' | 'hotel'> = ['weather'];
  if (/搜索|网上|查一下|攻略|新闻|search\b|look\s+up|web\b/i.test(msg)) {
    packs.push('exa');
  }
  if (/酒店|住宿|民宿|\bhotel\b|airbnb/i.test(msg)) {
    packs.push('hotel');
  }
  return [...new Set(packs)];
}
