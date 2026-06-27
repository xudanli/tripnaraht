import type { PersonaShellOutput } from '../services/persona-shell.service';
import type {
  PlanningWorkbenchRequestMetadata,
  PlanningWorkbenchResponse,
  WorkbenchBudgetPreview,
  WorkbenchConsolidatedDecision,
  WorkbenchConsolidatedDecisionStatus,
  WorkbenchDecisionContext,
} from '../services/planning-workbench-agent.service';
import type { PlanState } from '../../skills/plan/shared/plan-state.types';
import type {
  OptionComparison,
  PlanSkeleton,
  PlanSkeletonSet,
} from '../../skills/plan/shared/plan-state.types';
import type { RouteSegment } from '../../trips/decision/shared/world-model.types';
import type {
  GuardianHumanDecisionPoint,
  GuardianPersonaPresentation,
} from '../../trips/decision/shared/guardian-presentation.types';
import { flattenChooseOptionPoints } from '../../trips/decision/shared/guardian-choose-options.util';
import { resolveHardConstraintBlocked } from '../../trips/decision/shared/guardian-presentation.util';

export interface PlanningWorkbenchExecuteEnrichInput {
  skeletonOptions?: PlanSkeletonSet;
  comparison?: OptionComparison;
  confirmations?: string[];
  personas?: PersonaShellOutput;
}

/** 禁止作为 CHOOSE 选项 / 误入 confirmations 的占位文案 */
export const GENERIC_CHOOSE_PLACEHOLDERS = new Set([
  '确认你的价值取舍',
  '确认并锁定方案',
  '请在上方的决策点中选择一项后继续',
  '调整约束条件或选择其他方案',
  '查看替代方案',
  '请阅读确认点并勾选后继续',
]);

/** confirmations[] 不得出现的流程/调试元指令 */
export const PROCEDURAL_CONFIRMATION_PATTERNS: RegExp[] = [
  /^请在上方的决策点/,
  /^请阅读确认点/,
  /^点击提交/,
  /^勾选.*后点击/,
  /^lazy load/i,
  /dominant_cid/i,
  /\bkernel\b/i,
  /^plan_[a-z0-9_]+$/i,
  /trip_run/i,
  /metadata\./i,
  /\[DEBUG\]/i,
  /execute-async/i,
  /contextPackageId/i,
];

const GENERIC_SUMMARY_PLACEHOLDERS = new Set([
  'Abu 发现风险',
  '请选择方案',
  '风险',
  'Abu 阻断',
  '请选择',
]);

const INTERNAL_CONFIRMATION_LABELS: Record<string, string> = {
  world: '是否仍按当前方案继续？（环境与路况信息尚未完全核实）',
  '缺少世界模型上下文': '是否仍按当前方案继续？（环境与路况信息尚未完全核实）',
  '缺少证据引用': '是否仍继续规划？（部分行程关键依据尚未补齐）',
};

function poiDisplayName(poi: unknown): string | undefined {
  if (!poi || typeof poi !== 'object') return undefined;
  const p = poi as Record<string, unknown>;
  const nested = p.poi as Record<string, unknown> | undefined;
  return (
    (p.nameCN as string | undefined) ??
    (p.nameEN as string | undefined) ??
    (p.name as string | undefined) ??
    (nested?.nameCN as string | undefined) ??
    (nested?.nameEN as string | undefined)
  );
}

function collectDayPoiNames(metadata: Record<string, unknown>): {
  all: string[];
  attractions: string[];
  accommodation?: string;
} {
  const all: string[] = [];
  const attractions: string[] = [];

  const accommodation = poiDisplayName(metadata.accommodation);
  if (accommodation) all.push(accommodation);

  const restaurants = metadata.restaurants;
  if (Array.isArray(restaurants)) {
    for (const entry of restaurants) {
      const label = poiDisplayName(entry);
      if (label) {
        all.push(label);
        attractions.push(label);
      }
    }
  }

  const attractionList = metadata.attractions;
  if (Array.isArray(attractionList)) {
    for (const entry of attractionList) {
      const label = poiDisplayName(entry);
      if (label) {
        all.push(label);
        attractions.push(label);
      }
    }
  }

  const dedupe = (items: string[]) =>
    [...new Set(items.map((n) => n.trim()).filter(Boolean))];

  return {
    all: dedupe(all),
    attractions: dedupe(attractions),
    accommodation,
  };
}

/** 当日停留点预览（attractions → restaurants → accommodation） */
export function collectSegmentStops(metadata: Record<string, unknown>): string[] {
  const stops: string[] = [];

  const attractions = metadata.attractions;
  if (Array.isArray(attractions)) {
    for (const entry of attractions) {
      const label = poiDisplayName(entry);
      if (label) stops.push(label);
    }
  }

  const restaurants = metadata.restaurants;
  if (Array.isArray(restaurants)) {
    for (const entry of restaurants) {
      const label = poiDisplayName(entry);
      if (label) stops.push(label);
    }
  }

  const accommodation = poiDisplayName(metadata.accommodation);
  if (accommodation && !stops.includes(accommodation)) {
    stops.push(accommodation);
  }

  return [...new Set(stops.map((s) => s.trim()).filter(Boolean))];
}

function buildRouteSegmentName(
  fromName: string,
  toName: string,
  day?: number,
  theme?: string,
): string {
  if (fromName && toName && fromName !== toName) {
    return `${fromName} → ${toName}`;
  }
  if (theme && day) return `第${day}天：${theme}`;
  if (theme) return theme;
  if (day) return `第${day}天`;
  return fromName || toName || '行程段';
}

/** P0-1：为 segments.metadata 补充 name / fromName / toName */
export function enrichItinerarySegmentDisplayNames(segments: RouteSegment[]): RouteSegment[] {
  if (!segments.length) return segments;

  const enriched: RouteSegment[] = [];

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    const metadata = { ...(segment.metadata ?? {}) } as Record<string, unknown>;
    const day = metadata.day as number | undefined;
    const theme = metadata.theme as string | undefined;
    const description = metadata.description as string | undefined;
    const { all: poiNames, attractions: activityNames, accommodation } =
      collectDayPoiNames(metadata);

    const prevToName =
      index > 0 ? (enriched[index - 1].metadata?.toName as string | undefined) : undefined;

    const fromName =
      (metadata.fromName as string | undefined) ??
      (index > 0 ? prevToName : undefined) ??
      activityNames[0] ??
      theme ??
      (day ? `第${day}天` : `Day ${segment.dayIndex + 1}`);

    const toName =
      (metadata.toName as string | undefined) ??
      accommodation ??
      activityNames[activityNames.length - 1] ??
      theme ??
      description ??
      fromName;

    metadata.fromName = fromName;
    metadata.toName = toName;
    metadata.name =
      (metadata.name as string | undefined) ??
      buildRouteSegmentName(fromName, toName, day, theme);

    if (poiNames.length > 0 && !metadata.primaryPoiTitle) {
      metadata.primaryPoiTitle = activityNames[0] ?? poiNames[0];
    }

    const stops = collectSegmentStops(metadata);
    if (stops.length > 0) {
      metadata.stops = stops;
    }

    enriched.push({ ...segment, metadata });
  }

  return enriched;
}

export function isRealChooseOption(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  if (GENERIC_CHOOSE_PLACEHOLDERS.has(t)) return false;
  if (/^day_\d+_segment_/i.test(t)) return false;
  return true;
}

export function filterRealChooseOptions(options: string[]): string[] {
  const out: string[] = [];
  for (const opt of options) {
    const t = opt.trim();
    if (isRealChooseOption(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

export interface DecisionLayers {
  /** 风险事实陈述（只读） */
  summary: string;
  /** 用户签收项（NEED_CONFIRM 必填） */
  confirmations: string[];
  /** 操作指引（流程步骤） */
  nextSteps: string[];
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/_[^_]+_/g, '')
    .replace(/^[\s🐻‍❄️🎵🌊]+/u, '')
    .trim();
}

function firstSentence(text: string): string {
  const clean = stripMarkdown(text);
  const match = clean.match(/^[^。！？\n]+[。！？]?/);
  return (match?.[0] ?? clean).trim();
}

export function isProceduralOrDebugConfirmation(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (GENERIC_CHOOSE_PLACEHOLDERS.has(t)) return true;
  if (PROCEDURAL_CONFIRMATION_PATTERNS.some((p) => p.test(t))) return true;
  if (/^day_\d+_segment_/i.test(t)) return true;
  return false;
}

function dedupeLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

function humanizeRiskFact(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const mapped = INTERNAL_CONFIRMATION_LABELS[trimmed.replace(/^请确认：\s*/, '')];
  if (mapped && /[\u4e00-\u9fff]/.test(mapped)) {
    return mapped.replace(/^请确认是否/, '').replace(/，请确认.*$/, '');
  }
  return stripMarkdown(trimmed);
}

/** 层 1：风险事实 → summary */
export function buildRiskFactSummary(
  planState: PlanState,
  personas?: PersonaShellOutput,
  presentation?: GuardianPersonaPresentation,
): string {
  const facts: string[] = [];

  for (const reason of planState.gate.reasons ?? []) {
    const fact = humanizeRiskFact(String(reason));
    if (fact.length > 6 && !GENERIC_SUMMARY_PLACEHOLDERS.has(fact)) {
      facts.push(fact);
    }
  }

  if (planState.budget.overrun && planState.budget.overrun.overrunAmount > 0) {
    const currency = planState.constraints.budget?.currency ?? 'CNY';
    facts.push(
      `预算预估超出 ${planState.budget.overrun.overrunAmount} ${currency}，需确认是否接受。`,
    );
  }

  const infeasible = planState.mobility.transferSegments.filter(
    (s) => s.feasibility === 'infeasible',
  ).length;
  if (infeasible > 0) {
    facts.push(`${infeasible} 段跨城交通在当前时间窗内不可达。`);
  }

  for (const p of [
    personas?.personas.abu,
    personas?.personas.drdre,
    personas?.personas.neptune,
  ]) {
    if (!p?.explanation) continue;
    const sentence = firstSentence(p.explanation);
    if (
      sentence.length > 8 &&
      !GENERIC_SUMMARY_PLACEHOLDERS.has(sentence) &&
      !facts.some((f) => f.includes(sentence.slice(0, 12)))
    ) {
      facts.push(sentence);
    }
  }

  if (facts.length === 0 && presentation?.narrative) {
    const narrativeLine = firstSentence(presentation.narrative);
    if (narrativeLine.length > 10 && !GENERIC_SUMMARY_PLACEHOLDERS.has(narrativeLine)) {
      facts.push(narrativeLine);
    }
  }

  if (facts.length === 0) {
    return planState.gate.status === 'ALLOW'
      ? '当前方案未发现需特别说明的风险。'
      : '当前方案存在待确认事项，请阅读下方说明。';
  }

  return facts.slice(0, 3).join(' ');
}

function collectRawSignOffCandidates(
  uiOutput: PlanningWorkbenchResponse['uiOutput'],
  planState: PlanState,
): string[] {
  const raw: string[] = [...(uiOutput.confirmations ?? [])];

  for (const reason of planState.gate.reasons ?? []) {
    raw.push(String(reason));
  }
  for (const item of planState.gate.missingEvidence ?? []) {
    raw.push(String(item));
  }
  for (const item of planState.gate.requiredUserConfirmations ?? []) {
    raw.push(String(item));
  }

  const personas = uiOutput.personas?.personas;
  if (personas) {
    for (const p of [personas.abu, personas.drdre, personas.neptune]) {
      for (const c of p?.confirmations ?? []) {
        raw.push(String(c));
      }
    }
  }

  return raw;
}

/** 风险事实 → 签收问句（§3.3 confirmations 契约） */
export function toSignOffQuestion(fact: string): string {
  const factBody = fact.trim().replace(/[。！；]+$/u, '');
  if (!factBody || GENERIC_SUMMARY_PLACEHOLDERS.has(factBody)) {
    return '';
  }

  if (/^(是否|能否|可否)/.test(factBody) && /[？?]$/.test(factBody)) {
    return factBody;
  }

  if (/封闭|封路|不可通行|阻断|季节性封闭|F[\s-]?路/i.test(factBody)) {
    return '是否接受路线封闭风险并继续？';
  }
  if (/预算.*超出|超支|超出预算/.test(factBody)) {
    return '是否接受当前预算超支预估？';
  }
  if (/不可达|无法到达|交通.*不可/.test(factBody)) {
    return '是否接受上述交通不可达风险并继续？';
  }
  if (/路况|环境|证据|尚未核实|缺少.*信息|世界模型/.test(factBody)) {
    return '是否仍按当前方案继续？（环境与路况信息尚未完全核实）';
  }
  if (/疲劳|节奏|过紧|过赶|体力/.test(factBody)) {
    return '是否接受当前行程节奏安排并继续？';
  }
  if (/天气|风暴|大风|能见度/.test(factBody)) {
    return '是否了解并接受上述天气风险并继续？';
  }
  if (/待确认|风险提示/.test(factBody)) {
    return '是否确认已阅读上述风险提示并继续？';
  }

  const short = factBody.length > 48 ? `${factBody.slice(0, 45)}…` : factBody;
  return `是否了解并接受「${short}」后继续规划？`;
}

/** 陈述式确认文案 → 问句 */
export function ensureSignOffQuestionForm(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  if (/^(是否|能否|可否)/.test(trimmed) && /[？?]$/.test(trimmed)) {
    return trimmed;
  }

  const confirmWhether = trimmed.match(/请确认是否(.+?)([。；]|$)/u);
  if (confirmWhether) {
    const clause = confirmWhether[1].replace(/，请确认.*$/u, '').trim();
    return clause.endsWith('？') || clause.endsWith('?') ? `是否${clause}` : `是否${clause}？`;
  }

  if (/^请确认[：:]\s*/.test(trimmed)) {
    return toSignOffQuestion(trimmed.replace(/^请确认[：:]\s*/u, ''));
  }

  if (/请确认/.test(trimmed)) {
    const body = trimmed
      .replace(/^请确认[：:]?\s*/u, '')
      .replace(/[。；]+$/u, '')
      .trim();
    return body.startsWith('是否') ? `${body}？`.replace(/？？/u, '？') : `是否${body}？`;
  }

  return toSignOffQuestion(trimmed);
}

function deriveSignOffQuestionsFromGateAndSummary(
  planState: PlanState,
  summary: string,
): string[] {
  const questions: string[] = [];

  for (const reason of planState.gate.reasons ?? []) {
    const q = toSignOffQuestion(humanizeRiskFact(String(reason)));
    if (q && !questions.includes(q)) questions.push(q);
  }

  for (const item of planState.gate.requiredUserConfirmations ?? []) {
    const q = ensureSignOffQuestionForm(humanizeWorkbenchConfirmation(String(item)));
    if (q && !questions.includes(q)) questions.push(q);
  }

  if (planState.budget.overrun && planState.budget.overrun.overrunAmount > 0) {
    const budgetQ = '是否接受当前预算超支预估？';
    if (!questions.includes(budgetQ)) questions.push(budgetQ);
  }

  if (questions.length === 0 && summary.trim()) {
    for (const sentence of summary.split(/[。！]/u).map((s) => s.trim()).filter((s) => s.length > 6)) {
      const q = toSignOffQuestion(sentence);
      if (q && !questions.includes(q)) questions.push(q);
    }
  }

  return questions.slice(0, 4);
}

function shouldSkipAsSummaryDuplicate(text: string, summary: string): boolean {
  if (/^(是否|能否|可否)/.test(text.trim())) return false;
  return isDuplicateOfSummary(text, summary);
}

function isDuplicateOfSummary(text: string, summary: string): boolean {
  if (!text || !summary) return false;
  const a = text.slice(0, 24);
  const b = summary.slice(0, 24);
  return summary.includes(text) || text.includes(b);
}

function isSkeletonOptionLabel(text: string, uiOutput: PlanningWorkbenchResponse['uiOutput']): boolean {
  const flat = uiOutput.presentation?.humanDecisionPointsFlat ?? [];
  if (flat.includes(text)) return true;
  return /^.+ — .+$/.test(text) && flat.some((o) => o.startsWith(text.split(' — ')[0]));
}

/** 层 2：用户签收 → confirmations[] */
export function buildUserSignOffConfirmations(
  status: WorkbenchConsolidatedDecisionStatus,
  uiOutput: PlanningWorkbenchResponse['uiOutput'],
  planState: PlanState,
  summary: string,
): string[] {
  if (status === 'REJECT' || status === 'ALLOW') {
    return [];
  }

  const confirmations: string[] = [];
  for (const raw of collectRawSignOffCandidates(uiOutput, planState)) {
    const human = ensureSignOffQuestionForm(humanizeWorkbenchConfirmation(raw));
    if (!human || isProceduralOrDebugConfirmation(human)) continue;
    if (shouldSkipAsSummaryDuplicate(human, summary)) continue;
    if (isSkeletonOptionLabel(human, uiOutput)) continue;
    if (!confirmations.includes(human)) confirmations.push(human);
  }

  if (confirmations.length === 0 && status === 'NEED_CONFIRM') {
    if (planState.budget.overrun && planState.budget.overrun.overrunAmount > 0) {
      confirmations.push('是否接受当前预算超支预估？');
    }
    for (const p of [
      uiOutput.personas?.personas.abu,
      uiOutput.personas?.personas.drdre,
      uiOutput.personas?.personas.neptune,
    ]) {
      for (const c of p?.confirmations ?? []) {
        const human = ensureSignOffQuestionForm(humanizeWorkbenchConfirmation(String(c)));
        if (human && !isProceduralOrDebugConfirmation(human)) {
          confirmations.push(human);
        }
      }
    }
  }

  let deduped = dedupeLines(confirmations);

  if (deduped.length === 0 && (status === 'NEED_CONFIRM' || status === 'SUGGEST_REPLACE')) {
    deduped = deriveSignOffQuestionsFromGateAndSummary(planState, summary);
  }

  if (deduped.length === 0 && (status === 'NEED_CONFIRM' || status === 'SUGGEST_REPLACE')) {
    deduped.push('是否确认已阅读上述风险提示并继续？');
  }

  return deduped;
}

function isOperationGuidance(text: string): boolean {
  const t = text.trim();
  if (!t || t.length < 4) return false;
  if (isProceduralOrDebugConfirmation(t)) return false;
  const guidanceVerbs =
    /^(请|在|完成|确认|勾选|选择|调整|改|查看|提交|重新|根据|先|然后|或|点击)/;
  const actionVerbs = /(改走|调整|选择|提交|生成|对比|修改|替换|重新规划)/;
  return guidanceVerbs.test(t) || actionVerbs.test(t);
}

/** 层 3：操作指引 → nextSteps[] */
export function buildOperationNextSteps(
  status: WorkbenchConsolidatedDecisionStatus,
  uiOutput: PlanningWorkbenchResponse['uiOutput'],
  planState: PlanState,
  summary: string,
): string[] {
  const presentation = uiOutput.presentation ?? uiOutput.personas?.presentation;
  const personas = uiOutput.personas;
  const hasChoose =
    Boolean(presentation?.actions.user === 'CHOOSE') &&
    (presentation?.humanDecisionPointsFlat?.length ?? 0) >= 2;

  if (status === 'REJECT' || presentation?.hardConstraintBlocked) {
    const steps: string[] = [];
    for (const rec of personas?.personas.abu?.recommendations ?? []) {
      const action = String(rec.action ?? '').trim();
      if (action && isOperationGuidance(action) && !steps.includes(action)) {
        steps.push(action);
      }
    }
    return steps.length
      ? steps.slice(0, 4)
      : ['请先处理安全问题或调整路线后，再重新生成方案'];
  }

  if (hasChoose) {
    return ['在决策卡片中选择一项方案', '完成选择后点击提交'];
  }

  if (status === 'SUGGEST_REPLACE') {
    return ['根据风险摘要调整方案或更换骨架', '调整后重新生成并对比方案'];
  }

  if (status === 'NEED_CONFIRM') {
    return ['勾选全部确认项', '确认后点击提交方案'];
  }

  if (status === 'ALLOW') {
    return ['确认无误后点击提交，将方案写入行程'];
  }

  const legacy = personas?.consolidatedDecision.nextSteps ?? [];
  const filtered = legacy
    .map((s) => stripMarkdown(String(s)))
    .filter((s) => isOperationGuidance(s) && !isDuplicateOfSummary(s, summary));
  return filtered.length ? filtered.slice(0, 4) : ['请根据当前状态继续操作'];
}

/** 三层拆分 + 全中文 humanize */
export function splitDecisionLayers(input: {
  uiOutput: PlanningWorkbenchResponse['uiOutput'];
  planState: PlanState;
  status: WorkbenchConsolidatedDecisionStatus;
}): DecisionLayers {
  const { uiOutput, planState, status } = input;
  const presentation = uiOutput.presentation ?? uiOutput.personas?.presentation;

  const summary = buildRiskFactSummary(planState, uiOutput.personas, presentation);
  const confirmations = buildUserSignOffConfirmations(status, uiOutput, planState, summary);
  const nextSteps = buildOperationNextSteps(status, uiOutput, planState, summary);

  return { summary, confirmations, nextSteps };
}

/** P0-4：确认点用户可读化（单条） */
export function humanizeWorkbenchConfirmation(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  const withoutPrefix = trimmed.replace(/^请确认：\s*/, '');
  if (INTERNAL_CONFIRMATION_LABELS[withoutPrefix]) {
    return INTERNAL_CONFIRMATION_LABELS[withoutPrefix];
  }
  if (INTERNAL_CONFIRMATION_LABELS[trimmed]) {
    return INTERNAL_CONFIRMATION_LABELS[trimmed];
  }

  if (/^[a-z][a-z0-9_.-]*$/i.test(withoutPrefix) && !/[\u4e00-\u9fff]/.test(withoutPrefix)) {
    return `请确认：${withoutPrefix.replace(/_/g, ' ')}`;
  }

  return trimmed.startsWith('请') ? trimmed : trimmed;
}

function formatSkeletonOptionLabel(option: PlanSkeleton): string {
  const firstTheme = option.dayThemes?.[0]?.theme;
  return firstTheme ? `${option.name} — ${firstTheme}` : option.name;
}

function buildSkeletonChoosePoint(skeletonSet: PlanSkeletonSet): GuardianHumanDecisionPoint | null {
  const options = filterRealChooseOptions(
    (skeletonSet.options ?? []).map(formatSkeletonOptionLabel),
  );
  if (options.length < 2) return null;

  const skeletonOptions = skeletonSet.options ?? [];
  return {
    id: 'choose_skeleton_plan',
    question: '请选择行程骨架方案',
    options,
    recommendation: skeletonSet.recommendation?.optionId,
    optionIds: skeletonOptions
      .filter((o) => options.includes(formatSkeletonOptionLabel(o)))
      .map((o) => o.id),
  };
}

function buildComparisonChoosePoint(comparison: OptionComparison): GuardianHumanDecisionPoint | null {
  const options = filterRealChooseOptions(
    (comparison.options ?? []).map((row) => row.summary?.trim() || row.optionId),
  );
  if (options.length < 2) return null;

  return {
    id: 'choose_compared_plan',
    question: '请确认要采用的方案',
    options,
    recommendation: comparison.recommendation?.optionId,
    optionIds: (comparison.options ?? [])
      .filter((row) => options.includes(row.summary?.trim() || row.optionId))
      .map((row) => row.optionId),
  };
}

function buildPersonaChoosePoint(
  personas: PersonaShellOutput,
  presentation: GuardianPersonaPresentation,
): GuardianHumanDecisionPoint | null {
  const options: string[] = [];
  for (const persona of [personas.personas.abu, personas.personas.drdre, personas.personas.neptune]) {
    for (const rec of persona?.recommendations ?? []) {
      const text = String(rec.action ?? '').trim();
      if (isRealChooseOption(text) && !options.includes(text)) options.push(text);
    }
  }

  if (options.length < 2) return null;

  return {
    id: 'choose_guardian_tradeoff',
    question: presentation.headline || '请确认你的取舍',
    options: options.slice(0, 8),
  };
}

function resolveChooseDecisionPoints(
  input: PlanningWorkbenchExecuteEnrichInput,
  presentation: GuardianPersonaPresentation,
): GuardianHumanDecisionPoint[] {
  const points: GuardianHumanDecisionPoint[] = [];

  const skeletonPoint = input.skeletonOptions
    ? buildSkeletonChoosePoint(input.skeletonOptions)
    : null;
  if (skeletonPoint) points.push(skeletonPoint);

  const comparisonPoint = input.comparison ? buildComparisonChoosePoint(input.comparison) : null;
  if (comparisonPoint && !points.some((p) => p.id === comparisonPoint.id)) {
    points.push(comparisonPoint);
  }

  if (points.length === 0 && input.personas) {
    const personaPoint = buildPersonaChoosePoint(input.personas, presentation);
    if (personaPoint) points.push(personaPoint);
  }

  return points;
}

function isChoosePresentation(presentation: GuardianPersonaPresentation): boolean {
  return (
    presentation.actions?.user === 'CHOOSE' ||
    presentation.structuredStatus?.user?.action === 'CHOOSE'
  );
}

function clearChooseFromPresentation(presentation: GuardianPersonaPresentation): void {
  delete presentation.actions.user;
  if (presentation.structuredStatus?.user) {
    const { user: _user, ...rest } = presentation.structuredStatus;
    presentation.structuredStatus = rest;
  }
  delete presentation.humanDecisionPoints;
  delete presentation.humanDecisionPointsFlat;
}

function countRealChooseOptions(presentation: GuardianPersonaPresentation): number {
  const flat = presentation.humanDecisionPointsFlat ?? [];
  const structured = presentation.humanDecisionPoints?.[0]?.options ?? [];
  return Math.max(
    filterRealChooseOptions(flat).length,
    filterRealChooseOptions(structured).length,
  );
}

/** P0-3：门禁状态与 presentation / consolidated 对齐（仅 status；文案由 splitDecisionLayers 负责） */
export function reconcileWorkbenchGateState(
  uiOutput: PlanningWorkbenchResponse['uiOutput'],
): PlanningWorkbenchResponse['uiOutput'] {
  const presentation = uiOutput.presentation;
  const personas = uiOutput.personas;
  if (!presentation || !personas) return uiOutput;

  presentation.hardConstraintBlocked =
    presentation.hardConstraintBlocked ?? resolveHardConstraintBlocked(presentation);

  const hardBlocked = presentation.hardConstraintBlocked === true;

  if (hardBlocked) {
    clearChooseFromPresentation(presentation);
    personas.presentation = presentation;
    personas.consolidatedDecision = {
      ...personas.consolidatedDecision,
      status: 'REJECT',
    };
    return { ...uiOutput, presentation, personas };
  }

  const realOptionCount = countRealChooseOptions(presentation);
  const wantsChoose = isChoosePresentation(presentation);

  if (wantsChoose && realOptionCount < 2) {
    clearChooseFromPresentation(presentation);
  }

  const hasValidChoose = isChoosePresentation(presentation) && countRealChooseOptions(presentation) >= 2;

  if (hasValidChoose) {
    personas.consolidatedDecision = {
      ...personas.consolidatedDecision,
      status: 'NEED_CONFIRM',
    };
  } else if (personas.consolidatedDecision.status === 'ALLOW') {
    clearChooseFromPresentation(presentation);
  }

  personas.presentation = presentation;
  return { ...uiOutput, presentation, personas };
}

/** P0-2：CHOOSE 时写入真实选项 */
export function enrichPlanningWorkbenchPresentation(
  presentation: GuardianPersonaPresentation,
  input: PlanningWorkbenchExecuteEnrichInput,
): GuardianPersonaPresentation {
  if (!isChoosePresentation(presentation) || presentation.hardConstraintBlocked) {
    return presentation;
  }

  const humanDecisionPoints = resolveChooseDecisionPoints(input, presentation);
  if (humanDecisionPoints.length === 0) {
    return presentation;
  }

  const humanDecisionPointsFlat = filterRealChooseOptions(
    flattenChooseOptionPoints(
      humanDecisionPoints.map((p) => ({
        id: p.id,
        question: p.question,
        options: p.options,
        recommendation: p.recommendation,
      })),
    ),
  );

  if (humanDecisionPointsFlat.length < 2) {
    return presentation;
  }

  const normalizedPoints = humanDecisionPoints.map((p) => ({
    ...p,
    options: filterRealChooseOptions(p.options),
  }));

  const optionSummary = humanDecisionPointsFlat.slice(0, 4).join(' / ');
  const supportingLines = [...presentation.supportingLines];
  if (optionSummary && !supportingLines.some((l) => l.text.includes(optionSummary.slice(0, 16)))) {
    supportingLines.push({
      persona: presentation.leadSpeaker,
      icon: '🔀',
      name: '可选方案',
      role: 'repair',
      text: `可选：${optionSummary}${humanDecisionPointsFlat.length > 4 ? '…' : ''}`,
    });
  }

  return {
    ...presentation,
    supportingLines,
    humanDecisionPoints: normalizedPoints,
    humanDecisionPointsFlat,
  };
}

export function applyPresentationEnrichToPersonas(
  personas: PersonaShellOutput,
  enrichedPresentation: GuardianPersonaPresentation,
): PersonaShellOutput {
  return {
    ...personas,
    presentation: enrichedPresentation,
  };
}

function mapConsolidatedStatus(
  personas: PersonaShellOutput,
  planState: PlanState,
  presentation: GuardianPersonaPresentation,
): WorkbenchConsolidatedDecisionStatus {
  if (presentation.hardConstraintBlocked) return 'REJECT';
  if (planState.gate.status === 'SUGGEST_REPLACE') return 'SUGGEST_REPLACE';
  if (planState.gate.status === 'REJECT') return 'REJECT';
  return personas.consolidatedDecision.status as WorkbenchConsolidatedDecisionStatus;
}

function flattenOpenApiUiOutput(
  uiOutput: PlanningWorkbenchResponse['uiOutput'],
  planState: PlanState,
  tripId?: string,
  requestMetadata?: PlanningWorkbenchRequestMetadata,
): PlanningWorkbenchResponse['uiOutput'] {
  const personas = uiOutput.personas;
  const presentation = uiOutput.presentation ?? personas?.presentation;

  let consolidatedDecision: WorkbenchConsolidatedDecision | undefined;
  let signOffLayers: DecisionLayers = { summary: '', confirmations: [], nextSteps: [] };

  if (personas) {
    const status = presentation
      ? mapConsolidatedStatus(personas, planState, presentation)
      : (personas.consolidatedDecision.status as WorkbenchConsolidatedDecisionStatus);

    signOffLayers = splitDecisionLayers({ uiOutput, planState, status });

    consolidatedDecision = {
      status,
      summary: signOffLayers.summary,
      nextSteps: signOffLayers.nextSteps,
    };

    personas.consolidatedDecision = {
      ...personas.consolidatedDecision,
      status: consolidatedDecision.status as PersonaShellOutput['consolidatedDecision']['status'],
      summary: consolidatedDecision.summary,
      nextSteps: consolidatedDecision.nextSteps,
    };
  }

  return {
    ...uiOutput,
    confirmations: signOffLayers.confirmations,
    consolidatedDecision,
    timestamp: personas?.timestamp ?? uiOutput.timestamp ?? new Date().toISOString(),
    decisionContext: buildWorkbenchDecisionContext(planState, tripId, requestMetadata),
    budgetPreview: buildWorkbenchBudgetPreview(planState, uiOutput.health),
  };
}

export function buildWorkbenchDecisionContext(
  planState: PlanState,
  tripId?: string,
  requestMetadata?: PlanningWorkbenchRequestMetadata,
): WorkbenchDecisionContext {
  return {
    tripId: tripId ?? planState.itinerary?.tripId,
    planId: planState.plan_id,
    planVersion: planState.plan_version,
    gateStatus: planState.gate.status,
    contextPackageId: requestMetadata?.contextPackageId,
    scheduleRevision: requestMetadata?.scheduleRevision,
    constraintSnapshotId: requestMetadata?.constraintSnapshotId,
  };
}

export function buildWorkbenchBudgetPreview(
  planState: PlanState,
  health?: PlanningWorkbenchResponse['uiOutput']['health'],
): WorkbenchBudgetPreview {
  const currency = planState.constraints.budget?.currency ?? 'CNY';
  const limit = planState.constraints.budget?.total;
  const categories = planState.budget?.breakdown?.categories ?? [];
  const totalEstimate = categories.reduce((sum, cat) => sum + (cat.estimated ?? 0), 0);
  const evaluated = categories.length > 0;

  const band = health?.budget ?? 'healthy';
  let vsLimit: number | undefined;
  if (evaluated && limit && limit > 0) {
    vsLimit = Math.min(2, totalEstimate / limit);
  }

  let message: string | undefined;
  if (!evaluated) {
    message = '预算估算尚未完成，可在提交前单独查看预算评估';
  } else if (planState.budget.overrun?.overrunAmount) {
    message = `预估超出预算 ${planState.budget.overrun.overrunAmount} ${currency}`;
  } else if (vsLimit != null && vsLimit > 0.9) {
    message = `预估已占预算 ${Math.round(vsLimit * 100)}%`;
  }

  return {
    totalEstimate: evaluated ? totalEstimate : undefined,
    currency,
    vsLimit,
    evaluated,
    band,
    message,
  };
}

export function enrichPlanningWorkbenchExecuteResponse(input: {
  planState: PlanningWorkbenchResponse['planState'];
  uiOutput: PlanningWorkbenchResponse['uiOutput'];
  tripId?: string;
  requestMetadata?: PlanningWorkbenchRequestMetadata;
}): PlanningWorkbenchResponse {
  let { planState, uiOutput } = input;
  const { tripId, requestMetadata } = input;

  if (planState.itinerary?.segments?.length) {
    planState.itinerary.segments = enrichItinerarySegmentDisplayNames(
      planState.itinerary.segments,
    );
  }

  if (!uiOutput.presentation && !uiOutput.personas?.presentation) {
    return {
      planState,
      uiOutput: flattenOpenApiUiOutput(uiOutput, planState, tripId, requestMetadata),
    };
  }

  if (!uiOutput.presentation && uiOutput.personas?.presentation) {
    uiOutput = { ...uiOutput, presentation: uiOutput.personas.presentation };
  }

  const enrichContext: PlanningWorkbenchExecuteEnrichInput = {
    skeletonOptions: uiOutput.skeletonOptions ?? planState.metadata?.skeletonOptions,
    comparison: uiOutput.comparison ?? (planState.metadata?.comparison as OptionComparison | undefined),
    personas: uiOutput.personas,
  };

  let enrichedPresentation = enrichPlanningWorkbenchPresentation(
    uiOutput.presentation,
    enrichContext,
  );

  let nextUiOutput: PlanningWorkbenchResponse['uiOutput'] = {
    ...uiOutput,
    presentation: enrichedPresentation,
  };

  if (uiOutput.personas) {
    nextUiOutput.personas = applyPresentationEnrichToPersonas(
      uiOutput.personas,
      enrichedPresentation,
    );
    nextUiOutput.presentation = nextUiOutput.personas.presentation;
  }

  nextUiOutput = reconcileWorkbenchGateState(nextUiOutput);
  if (nextUiOutput.presentation) {
    nextUiOutput.presentation = {
      ...nextUiOutput.presentation,
      hardConstraintBlocked:
        nextUiOutput.presentation.hardConstraintBlocked ??
        resolveHardConstraintBlocked(nextUiOutput.presentation),
    };
  }

  return {
    planState,
    uiOutput: flattenOpenApiUiOutput(nextUiOutput, planState, tripId, requestMetadata),
  };
}
