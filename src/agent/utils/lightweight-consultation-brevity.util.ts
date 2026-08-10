/**
 * 轻量咨询（快咨询 / 旅行顾问）话术篇幅控制。
 * fast 默认短答；行程概览 / 吃住方案（或用户明确要详细）才展开结构。
 */

export type LightweightConsultationVerbosity = 'trivia' | 'compact' | 'structured';

/** 用户明确要求详细/展开（在默认短答之上放宽） */
export function isExplicitDetailConsultationQuery(msg: string, msgLower?: string): boolean {
  const m = String(msg ?? '').trim();
  if (!m) return false;
  const lower = msgLower ?? m.toLowerCase();
  return (
    /详细|详尽|展开说|说详细|讲详细|全面分析|完整方案|长一点|再细一点|尽量详细/.test(m) ||
    /\b(in\s+detail|detailed|comprehensive|thorough|elaborate|full\s+plan)\b/i.test(lower)
  );
}

export function resolveLightweightConsultationVerbosity(input: {
  triviaFact: boolean;
  tripStatusOverview: boolean;
  tripLodgingDiningPlan: boolean;
  explicitDetail: boolean;
}): LightweightConsultationVerbosity {
  if (input.triviaFact) return 'trivia';
  if (input.tripStatusOverview || input.tripLodgingDiningPlan || input.explicitDetail) {
    return 'structured';
  }
  return 'compact';
}

/** 人设 + 默认篇幅（trivia 由专用时钟/宏观事实行覆盖） */
export function buildLightweightConsultationRolePromptLines(
  verbosity: LightweightConsultationVerbosity,
): string[] {
  if (verbosity === 'trivia') {
    return ['你是专业旅行顾问。'];
  }
  if (verbosity === 'structured') {
    return [
      '你是专业旅行顾问。当前请求被路由为「咨询/检索」类（非完整多日行程 JSON 生成）。',
      '【篇幅·展开】本题需结构化作答，但仍须先给一句话结论，再按指定小节展开；每节通常 1～2 句，避免空泛开场与重复清单。',
      '【排版】禁止把多节挤成一整段：结论单独一行，各小节/要点分行，段落之间空一行；须输出真实换行符（不要用空格代替换行）。',
      '可含预算区间、油价/租车参考、门票大致范围；无法确定时请说明假设。',
      '行动建议合计不超过 4 条；勿用超过 8 个小标题。',
    ];
  }
  return [
    '你是专业旅行顾问。当前请求被路由为「咨询/检索」类（非完整多日行程 JSON 生成）。',
    '【篇幅·快答】先结论后补充：正文优先 2～5 句说清答案；最多 3 条可执行下一步（用 `-` 列表）。',
    '【排版】禁止把多句挤成一整段：结论单独一行，要点用 `-` 列表且每条一行，段落之间空一行；须输出真实换行符（不要用空格代替换行）。',
    '禁止长篇攻略体、禁止堆叠小标题（全文小标题≤3）；勿复述行程全文时间轴；勿用「作为旅行顾问」类套话开场。',
    '需要预算/价格时只给区间与假设；不确定就一句说明，不要展开无关维度。',
    '用户未要求「详细/全面」时，不要主动输出住宿+餐饮逐日长方案或准备度七段报告。',
  ];
}

/** 租车/车行推荐：强制短结构 + 换行，避免「一整坨」正文 */
export function buildCarRentalConsultationBodyPromptLines(hasCards: boolean): string[] {
  const lines = [
    '【租车正文排版】用户可见正文必须按下列结构换行输出（禁止单段长文）：',
    '结论：（一句话，单独成行）',
    '',
    '- 取还车：…',
    '- 车型：…',
    '- 推荐车行：点名 2～3 家及一句理由',
    '- 保险注意：…',
    '列表每项单独一行；「结论」与列表之间空一行。',
  ];
  if (hasCards) {
    lines.push(
      '【界面与正文分工】结果载荷已含租车结构化卡片（car_rental_cards）；正文勿长抄官网链接与价目表，报价细节交给卡片。',
    );
  }
  return lines;
}

/**
 * 用户可见正文若几乎无换行，按中文句号拆成可读短行（不改动已有列表/多段排版）。
 * 适用于全部咨询/快答回复，不限租车。
 */
export function formatDenseConsultationAnswerWithLineBreaks(text: string): string {
  const raw = String(text ?? '');
  if (!raw.trim()) return raw;
  // 已有空行或 Markdown 列表 → 视为已排版
  if (/\n\s*\n/.test(raw) || /(^|\n)\s*[-*•]\s+\S/.test(raw)) {
    return raw.replace(/\n{3,}/g, '\n\n').trim();
  }
  const physicalLines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  // 已拆成多行，保持原样
  if (physicalLines.length >= 3) {
    return raw.replace(/\n{3,}/g, '\n\n').trim();
  }

  let t = physicalLines.join(' ').replace(/\s+/g, ' ').trim();
  // 单句短答不动
  const sentenceEnds = t.match(/[。！？]/g) ?? [];
  if (t.length < 56 && sentenceEnds.length <= 1) {
    return t;
  }

  t = t.replace(/^(结论[：:])\s*/, '结论：\n');
  t = t.replace(/^(建议[：:])\s*/, '建议：\n');
  t = t.replace(/^(推荐[：:])\s*/, '推荐：\n');
  // 句号后换行（保留引号/括号内不断开的常见收尾）
  t = t.replace(/([。！？])(?=[^\n」』）\]》])/g, '$1\n');
  // 常见过渡词前空一行，便于扫读
  t = t.replace(
    /\n((?:另外|此外|其次|最后|注意|建议|推荐|提车时|取还车|本地公司|保险|住宿|餐饮|行程|路况)[：:]?)/g,
    '\n\n$1',
  );
  // 结论/建议/推荐首行与后文空一行
  t = t.replace(/^((?:结论|建议|推荐)：\n[^\n]+)\n(?!\n)/, '$1\n\n');
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 绑定 trip 时的机读 Dashboard / 建议操作块约束。
 * compact：可省略完整四卡，便于服务端兜底；structured：保留四卡强约束语义（由调用方叠加专题行）。
 */
export function buildLightweightConsultationUiBlockPromptLines(input: {
  verbosity: LightweightConsultationVerbosity;
  markers: {
    uiStart: string;
    uiEnd: string;
    opsStart: string;
    opsEnd: string;
  };
}): string[] {
  const { verbosity, markers } = input;
  if (verbosity === 'trivia') return [];

  if (verbosity === 'compact') {
    return [
      '【系统块 CONSULTATION_UI·可选】若能用一句话概括结论，可在正文后输出机读 JSON（**禁止**在用户可见正文写「Dashboard」字样）：',
      `第一行仅写：${markers.uiStart}`,
      '第二行：单行 JSON，字段尽量少：version=1、headline（必填）、可选 summary_cards 至多 2 张（title/value/hint/tone）。无把握可整块省略（后端可兜底）。',
      `最后一行仅写：${markers.uiEnd}`,
      '【系统块 SUGGESTED_OPS·精简】正文后输出 1～2 条操作按钮 JSON（禁止在正文复述）：',
      `第一行仅写：${markers.opsStart}`,
      '第二行：单行 JSON 数组，元素含 id、label（≤18字）、kind（route_and_run_message|client_navigation）、payload；至少 1 条 route_and_run_message。',
      `最后一行仅写：${markers.opsEnd}`,
    ];
  }

  return [
    '【系统块 CONSULTATION_UI】在正文之后、建议操作块之前，输出机读单行 JSON（**禁止**在用户可见正文写「Dashboard」或同级标题）：',
    `第一行仅写：${markers.uiStart}`,
    '第二行至结束标记前：单行合法 JSON 对象，字段示例（version 固定为 1）：headline（Hero 一句话结论）、subheadline；score_dimensions[{id,label,level(low|medium|high|extreme|unknown),short_note}]；summary_cards[{id,title,value,hint,tone(neutral|positive|warning|danger)}]（建议 4 张：预算/驾驶或强度/亮点区域/最大风险）；risks[{id,level(low|medium|high),title,detail,suggestions}]；daily_plan[{day_index,title,segments[{time,label,detail,risk_badge}]}]（简版时间轴）；budget{currency,total_range_label,breakdown[]}；booking_deadlines[{id,title,urgency(now|soon|flexible),note}]；map{nodes[{label,kind}],path_coordinates[[lng,lat],...]}（无可靠坐标则省略 path_coordinates）。',
    '内容须与正文一致；不得编造未出现的地名或预订记录；无法结构化时可整块省略。',
    `最后一行仅写：${markers.uiEnd}`,
    '【系统块 SUGGESTED_OPS】在 CONSULTATION_UI 之后输出机读 JSON（**禁止**在正文写「一键操作」或复述该 JSON）：',
    `第一行仅写：${markers.opsStart}`,
    '第二行起至结束标记前：单行合法 JSON 数组，元素字段：id（英文短键）、label（按钮文案≤18字）、kind（仅 route_and_run_message 或 client_navigation）、payload（对象）。',
    '—— route_and_run_message：payload.message 为完整中文指令，用户点击后作为新一轮对话发给助手（用于「按建议改行程」「搜索某地酒店」）；须贴合正文结论。',
    '—— client_navigation：payload.route 可为 timeline / replay / planning / itinerary / decision_cockpit；**仅当按钮文案是「发起投票/创建投票」时**才可用 silent_vote_create / silent_vote（或 action=silent_vote_create）。搜索酒店/查房绝不可用 silent_vote_*，必须用 route_and_run_message。并须在 payload 中带 trip_id（值等于当前关联行程）。',
    '数组长度 2～4；至少包含 1 条 route_and_run_message。',
    `最后一行仅写：${markers.opsEnd}`,
  ];
}

/** 概览/吃住展开模板顶部的压缩提醒（插在专题结构之前） */
export function buildStructuredConsultationDensityPromptLines(
  kind: 'overview' | 'lodging_dining' | 'explicit_detail',
): string[] {
  if (kind === 'explicit_detail') {
    return [
      '【展开模式】用户要详细说明：可适度加长，但仍先结论；避免与机读卡片重复罗列同一清单。',
    ];
  }
  if (kind === 'lodging_dining') {
    return [
      '【展开密度】逐晚/逐日各用短句；有结构化房源卡片时正文勿再抄房名与价目。',
    ];
  }
  return [
    '【展开密度】按指定小节各写 1～2 句要点即可；分数与阻塞项点到为止，勿写成万字报告。',
  ];
}
