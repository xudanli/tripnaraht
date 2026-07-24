import { parseCompoundIntentPlan, splitCompoundClauses } from './compound-intent.util';

describe('compound-intent.util', () => {
  it('splits compound clauses', () => {
    expect(splitCompoundClauses('删酒店，顺便看看天气')).toEqual(['删酒店', '看看天气']);
  });

  it('detects crud + data lookup compound plan', () => {
    const plan = parseCompoundIntentPlan(
      '帮我把第二天的酒店删了，顺便看看那天下午能不能徒步吗',
    );
    expect(plan.isCompound).toBe(true);
    expect(plan.crudClauses.length).toBeGreaterThan(0);
    expect(plan.dataLookupClauses.length).toBeGreaterThan(0);
  });

  it('single intent is not compound', () => {
    const plan = parseCompoundIntentPlan('维克超市可以买到什么水果');
    expect(plan.isCompound).toBe(false);
    expect(plan.dataLookupClauses).toEqual(['维克超市可以买到什么水果']);
  });
});
