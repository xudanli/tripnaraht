import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 契约守卫：用户可见中文 copy 生产点禁止把 ISO 原串拼进模板。
 * 结构化字段（payload / anchors）允许保留 ISO；本守卫只扫“文案拼装”热路径。
 */
const COPY_HOT_PATHS = [
  'src/trips/trip-constraint-solver/services/feasibility-report.service.ts',
  'src/trips/services/trip-conflicts.service.ts',
  'src/trips/trip-constraint-solver/utils/feasibility-assembler.util.ts',
  'src/trips/decision-semantics/propagation/impact-propagation.service.ts',
  'src/trips/decision/strategies/neptune-strategy.service.ts',
  'src/trips/execution-risk-center/utils/execution-alerts-projection.util.ts',
  'src/trips/execution-risk-center/utils/execution-risk-cluster.util.ts',
  'src/trips/guardian-decision-core/adapters/execution-slip-option-copy.util.ts',
] as const;

/** 在模板字面量中调用 toISO / toISOString，或插值明显为 *Iso / newStartTime 未过 formatter */
const FORBIDDEN_IN_TEMPLATE = [
  /\$\{[^}]*\.toISOString\(\)[^}]*\}/,
  /\$\{[^}]*\.toISO\(\)[^}]*\}/,
  /\$\{suggestedIso\}/,
  /\$\{arriveAt\}/,
  /调整到 \$\{suggestedTime\}/,
  /调整到 \$\{result\.newStartTime\}/,
  /toISOString\(\)\.slice\(11,\s*16\)/,
];

describe('user-facing clock copy contract', () => {
  it('forbids raw ISO interpolation in decision/repair copy hot paths', () => {
    const root = join(__dirname, '../../..');
    const violations: string[] = [];

    for (const rel of COPY_HOT_PATHS) {
      const src = readFileSync(join(root, rel), 'utf8');
      for (const pattern of FORBIDDEN_IN_TEMPLATE) {
        const match = pattern.exec(src);
        if (match) {
          violations.push(`${rel}: matched ${pattern} → ${match[0]}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
