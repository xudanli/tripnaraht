import {
  formatBudgetCategoryLabel,
  formatStructureMismatchDetail,
  formatUserBudgetEvaluationReason,
  sumCategoryBreakdown,
} from './budget-evaluation-copy.util';

describe('budget-evaluation-copy.util', () => {
  describe('formatUserBudgetEvaluationReason', () => {
    it('uses plain copy when estimated cost is zero', () => {
      const reason = formatUserBudgetEvaluationReason({
        estimatedCost: 0,
        totalBudget: 65000,
        currency: 'CNY',
        ratio: 0,
        structureMismatches: [],
        categoryExceeded: [],
        walletUnset: false,
      });

      expect(reason).toContain('总预算 ¥65,000 已设定');
      expect(reason).toContain('行程花费尚未汇总');
      expect(reason).not.toContain('accommodation');
      expect(reason).not.toContain('偏差');
    });

    it('does not mention structure mismatch in reason when no cost data', () => {
      const reason = formatUserBudgetEvaluationReason({
        estimatedCost: 0,
        totalBudget: 65000,
        currency: 'CNY',
        ratio: 0,
        structureMismatches: [
          {
            category: 'accommodation',
            intentAmount: 24000,
            estimatedAmount: 0,
            variancePercent: 1,
          },
        ],
        categoryExceeded: [],
        walletUnset: false,
      });

      expect(reason).not.toContain('与预算结构差异');
      expect(reason).not.toContain('偏差');
    });

    it('summarizes structure mismatch in Chinese when cost data exists', () => {
      const reason = formatUserBudgetEvaluationReason({
        estimatedCost: 30000,
        totalBudget: 65000,
        currency: 'CNY',
        ratio: 30000 / 65000,
        structureMismatches: [
          {
            category: 'accommodation',
            intentAmount: 24000,
            estimatedAmount: 5000,
            variancePercent: 0.79,
          },
          {
            category: 'transportation',
            intentAmount: 12000,
            estimatedAmount: 8000,
            variancePercent: 0.33,
          },
        ],
        categoryExceeded: [],
        walletUnset: false,
      });

      expect(reason).toContain('当前预估');
      expect(reason).toContain('住宿、交通与预算结构差异较大');
    });

    it('mentions wallet unset for group trips', () => {
      const reason = formatUserBudgetEvaluationReason({
        estimatedCost: 0,
        totalBudget: 65000,
        currency: 'CNY',
        ratio: 0,
        structureMismatches: [],
        categoryExceeded: [],
        walletUnset: true,
      });

      expect(reason).toContain('付款规则');
    });
  });

  describe('formatStructureMismatchDetail', () => {
    it('uses Chinese category labels', () => {
      const msg = formatStructureMismatchDetail({
        category: 'food',
        intentAmount: 14000,
        estimatedAmount: 2000,
        variancePercent: 0.86,
      });

      expect(msg).toBe('餐饮预估 ¥2,000，低于预算结构 ¥14,000');
    });
  });

  describe('formatBudgetCategoryLabel', () => {
    it('maps known categories', () => {
      expect(formatBudgetCategoryLabel('experience')).toBe('体验');
    });
  });

  describe('sumCategoryBreakdown', () => {
    it('sums numeric breakdown fields', () => {
      expect(
        sumCategoryBreakdown({
          accommodation: 1000,
          food: 500,
          transportation: undefined,
        }),
      ).toBe(1500);
    });
  });
});
