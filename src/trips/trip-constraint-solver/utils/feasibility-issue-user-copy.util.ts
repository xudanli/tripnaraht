/**
 * 可行性 issue → C 端人话（与 Decision Checker evidence / judgmentExplanation 同源）
 */

import type { FeasibilityIssueDto, FeasibilityProofDto } from '../types/trip-constraint-solver.types';
import { formatDriveDurationZhLong } from './daily-drive-threshold.util';

const INTERNAL_TEXT_PATTERNS: RegExp[] = [
  /^\[(timelineDisplayRole|split):/i,
  /^模板推荐的/,
  /persona\s+closure/i,
  /\bstop=ABU/i,
  /\brechecks=\d/i,
  /Place\.metadata\./i,
];

/** 英文碎片或内部串 — 不宜直接展示给用户 */
export function isLowQualityUserFacingText(text: string | undefined): boolean {
  const t = String(text ?? '').trim();
  if (!t) return true;
  if (INTERNAL_TEXT_PATTERNS.some((re) => re.test(t))) return true;

  const latin = (t.match(/[A-Za-z]/g) ?? []).length;
  const cjk = (t.match(/[\u4e00-\u9fff]/g) ?? []).length;
  if (latin >= 24 && cjk < 8) return true;
  if (/^[\s'"]*[A-Za-z]/.test(t) && cjk < 6) return true;
  if (cjk > 0 && latin >= 20 && /[\u4e00-\u9fff].*[A-Za-z]{10,}/.test(t)) return true;
  const afterCjkPrefix = t.replace(/^[\u4e00-\u9fff\s·•：:，,。'"]+/u, '').trim();
  if (
    afterCjkPrefix.length >= 16 &&
    (afterCjkPrefix.match(/[A-Za-z]/g) ?? []).length >= 12 &&
    (afterCjkPrefix.match(/[\u4e00-\u9fff]/g) ?? []).length < 4
  ) {
    return true;
  }
  return false;
}

function humanizeEvidenceSource(source?: string): string {
  const s = source?.trim() ?? '';
  if (!s) return '系统验证';
  if (/openingHours|opening_hours/i.test(s)) return '营业时间';
  if (/roadStatus|road_closure/i.test(s)) return '道路状态';
  if (/weatherInfo|weather/i.test(s)) return '天气';
  if (/bookingConfirmation|booking/i.test(s)) return '预约确认';
  if (/permit/i.test(s)) return '许可';
  if (/Place\.metadata/i.test(s)) return '地点资料';
  if (/osrm|route/i.test(s)) return '路线引擎';
  if (/road.?closure|closure/i.test(s)) return '封路监测';
  if (/readiness|coverage/i.test(s)) return '准备度验证';
  if (/trip-conflicts|conflicts/i.test(s)) return '行程冲突检测';
  return s.replace(/^Place\.metadata\./i, '').replace(/([A-Z])/g, ' $1').trim() || '系统验证';
}

/** 正向覆盖证明（「已具备证据」）不应出现在用户问题描述里 */
function isPositiveCoverageProof(proof: FeasibilityProofDto): boolean {
  const text = `${proof.currentFact ?? ''} ${proof.conclusion ?? ''}`;
  if (/缺少|未覆盖|不可通行|封闭|中断|超标|不宜|风险|冲突|拒绝/i.test(text)) {
    return false;
  }
  return /已具备|证据覆盖充分|证据已记录|部分覆盖/i.test(text);
}

function humanizeProofFact(proof: FeasibilityProofDto): string | undefined {
  let fact = proof.currentFact?.trim() || proof.conclusion?.trim();
  if (!fact || isLowQualityUserFacingText(fact)) return undefined;

  fact = fact
    .replace(/Place\.metadata\.\w+/gi, '')
    .replace(/已具备\s+/g, '')
    .replace(/\s*证据\s*$/u, '')
    .trim();

  const place = proof.placeLabel?.trim() || proof.entity?.trim();
  const label = humanizeEvidenceSource(proof.evidenceSource);

  if (/缺少|未覆盖|封闭|中断|超标|不宜|风险/i.test(fact)) {
    return place ? `${place}：${fact}` : fact;
  }

  if (place && !fact.includes(place)) {
    return `${place}（${label}）${fact}`;
  }
  return fact;
}

function formatRiskProofLine(proof: FeasibilityProofDto): string | undefined {
  if (isPositiveCoverageProof(proof)) return undefined;
  const fact = humanizeProofFact(proof);
  if (!fact) return undefined;
  return fact;
}

function buildDailyDriveExplanation(issue: FeasibilityIssueDto): string {
  const proof = issue.proofs?.find((p) => p.constraint === 'max_daily_drive');
  const publisher = humanizeEvidenceSource(proof?.evidenceSource);
  const driveFact =
    proof?.currentFact?.replace(/^预计驾驶\s*/u, '').trim() ||
    (typeof issue.anchors?.travelMinutes === 'number'
      ? formatDriveDurationZhLong(issue.anchors.travelMinutes)
      : '');
  if (!driveFact) {
    return `${publisher}发现驾驶时长超限，建议拆分当天行程或缩短路程。`;
  }
  return `第 ${issue.affectedDays?.[0] ?? '当'} 天预计驾驶 ${driveFact}，超过每日上限，建议减少路程或增加休息。`;
}

function buildCoverageGapExplanation(issue: FeasibilityIssueDto): string {
  const day = issue.affectedDays?.[0];
  const fromTitle = issue.title?.replace(/^第\s*\d+\s*天\s*[·•]?\s*/u, '').trim();
  const place = issue.proofs?.find((p) => p.placeLabel)?.placeLabel?.trim() || fromTitle;
  if (day && place) {
    return `第 ${day} 天 · ${place} 还缺路线或营业时间验证，暂无法确认能否按计划游玩。`;
  }
  return '部分行程点尚未完成验证，建议打开决策检查器查看详情。';
}

function buildPaceExplanation(issue: FeasibilityIssueDto): string {
  const msg = issue.message?.trim();
  if (msg && !isLowQualityUserFacingText(msg)) {
    return msg.replace(/，建议留出缓冲/u, '，建议减少 1 个景点或留出缓冲');
  }
  const day = issue.affectedDays?.[0];
  if (day) {
    return `第 ${day} 天行程偏紧，建议减少景点数量或增加转场缓冲。`;
  }
  return '部分天数安排过满，建议放宽节奏。';
}

function resolveLeadSentence(issue: FeasibilityIssueDto): string | undefined {
  const msg = issue.message?.trim();
  if (msg && !isLowQualityUserFacingText(msg)) return msg;
  const title = issue.title?.trim();
  if (title && !isLowQualityUserFacingText(title)) return title;
  const action = issue.actionRequired?.trim();
  if (action && !isLowQualityUserFacingText(action)) return action;
  return undefined;
}

/**
 * 委员会 / Decision Checker 共用：1–2 句人话，不堆 metadata / 正向证据
 */
export function buildFeasibilityIssueUserExplanation(issue: FeasibilityIssueDto): string {
  if (issue.issueKind === 'daily_drive') {
    return buildDailyDriveExplanation(issue);
  }

  const kind = String(issue.issueKind ?? '');
  const msg = issue.message?.trim() ?? '';
  if (kind.includes('coverage') || msg.includes('缺少证据覆盖')) {
    return buildCoverageGapExplanation(issue);
  }

  if (
    kind.includes('pace') ||
    issue.category === 'schedule' ||
    /个景点|节奏|偏紧|缓冲|过满/i.test(msg)
  ) {
    return buildPaceExplanation(issue);
  }

  const lead = resolveLeadSentence(issue);
  const riskProof = (issue.proofs ?? []).map(formatRiskProofLine).find(Boolean);

  if (lead && riskProof && !lead.includes(riskProof)) {
    const severityHint =
      issue.priority === 'must_handle' ? '这属于需优先处理的安全问题。' : '建议微调后再定稿。';
    return `${lead} ${severityHint}`;
  }

  if (lead) {
    if (issue.priority === 'must_handle' && issue.category === 'environment') {
      return `${lead} 建议查看决策检查器中的封路/天气证据后再出发。`;
    }
    return lead;
  }

  if (riskProof) return riskProof;

  return issue.title?.trim() || '当前方案需要调整，请打开决策检查器查看详情。';
}

/** 委员会卡片副文案：最多 2 条风险证据（不含「已具备证据」） */
export function buildFeasibilityIssueEvidenceLines(issue: FeasibilityIssueDto): string[] {
  const risks = (issue.proofs ?? [])
    .map(formatRiskProofLine)
    .filter((line): line is string => Boolean(line))
    .slice(0, 2);

  if (risks.length > 0) return risks;

  const explanation = buildFeasibilityIssueUserExplanation(issue);
  return explanation ? [explanation] : [];
}
