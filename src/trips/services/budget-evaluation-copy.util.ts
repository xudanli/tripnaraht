const CATEGORY_LABEL_ZH: Record<string, string> = {
  accommodation: '住宿',
  transportation: '交通',
  experience: '体验',
  activities: '活动',
  food: '餐饮',
  other: '其他',
};

export function formatBudgetCategoryLabel(category: string): string {
  return CATEGORY_LABEL_ZH[category] ?? category;
}

function formatMoney(amount: number, currency: string): string {
  const rounded = Math.round(amount);
  const symbol = currency === 'CNY' ? '¥' : `${currency} `;
  return `${symbol}${rounded.toLocaleString('zh-CN')}`;
}

export function sumCategoryBreakdown(breakdown: Record<string, number | undefined>): number {
  return Object.values(breakdown).reduce<number>((sum, n) => sum + (typeof n === 'number' ? n : 0), 0);
}

export type StructureMismatchRow = {
  category: string;
  intentAmount: number;
  estimatedAmount: number;
  variancePercent: number;
};

export function formatStructureMismatchDetail(m: StructureMismatchRow): string {
  const label = formatBudgetCategoryLabel(m.category);
  const planned = formatMoney(m.intentAmount, 'CNY');
  const actual = formatMoney(m.estimatedAmount, 'CNY');
  if (m.estimatedAmount > m.intentAmount) {
    return `${label}预估 ${actual}，高于预算结构 ${planned}`;
  }
  return `${label}预估 ${actual}，低于预算结构 ${planned}`;
}

export function formatUserBudgetEvaluationReason(input: {
  estimatedCost: number;
  totalBudget: number;
  currency: string;
  ratio: number;
  structureMismatches: StructureMismatchRow[];
  categoryExceeded: string[];
  walletUnset: boolean;
}): string {
  const { estimatedCost, totalBudget, currency, ratio, structureMismatches, categoryExceeded, walletUnset } =
    input;

  if (estimatedCost <= 0) {
    let text = `总预算 ${formatMoney(totalBudget, currency)} 已设定。行程花费尚未汇总，完善住宿/活动后会自动对比。`;
    if (walletUnset) {
      text += ' 组队出行建议先设置付款规则。';
    }
    return text;
  }

  const parts: string[] = [];

  if (ratio > 1) {
    parts.push(
      `当前预估 ${formatMoney(estimatedCost, currency)}，超出总预算 ${formatMoney(totalBudget, currency)} 约 ${Math.round((ratio - 1) * 100)}%，建议优化行程。`,
    );
  } else if (ratio > 0.95) {
    parts.push(
      `当前预估 ${formatMoney(estimatedCost, currency)}，已用预算 ${(ratio * 100).toFixed(0)}%，接近上限，建议查看优化方案。`,
    );
  } else if (ratio > 0.8) {
    parts.push(
      `当前预估 ${formatMoney(estimatedCost, currency)}，已用预算 ${(ratio * 100).toFixed(0)}%，仍在范围内但偏高。`,
    );
  } else {
    parts.push(
      `当前预估 ${formatMoney(estimatedCost, currency)}，已用预算 ${(ratio * 100).toFixed(0)}%，在预算范围内。`,
    );
  }

  if (categoryExceeded.length > 0) {
    const labels = categoryExceeded.map(formatBudgetCategoryLabel).join('、');
    parts.push(`${labels}超出分类上限。`);
  }

  if (structureMismatches.length > 0) {
    const labels = [...new Set(structureMismatches.map((m) => formatBudgetCategoryLabel(m.category)))].slice(
      0,
      3,
    );
    parts.push(`${labels.join('、')}与预算结构差异较大，可查看优化方案。`);
  }

  if (walletUnset) {
    parts.push('组队出行尚未设置付款规则。');
  }

  return parts.join(' ');
}
