/**
 * Decision Node 接口独立测试脚本
 * 
 * 不依赖 NestJS，直接测试接口结构和类型
 * 
 * 运行方式：
 *   npx ts-node scripts/test-decision-node-standalone.ts
 */

import {
  DecisionNode,
  DecisionOption,
  DecisionOutput,
  TradeoffDimension,
  TradeoffModel,
  Constraint,
  ConstraintType,
  UncertaintyProfile,
  ComparisonMatrix,
  DecisionTree,
} from '../src/agent/interfaces/decision-node.interface';

// ============================================================================
// 颜色输出
// ============================================================================
const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

// ============================================================================
// 测试辅助函数
// ============================================================================

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(colors.red(`断言失败: ${message}`));
  }
}

function printSection(title: string) {
  console.log('\n' + colors.cyan('─'.repeat(60)));
  console.log(colors.bold(title));
  console.log(colors.cyan('─'.repeat(60)));
}

// ============================================================================
// 测试 1: Constraint 接口
// ============================================================================

function testConstraint() {
  printSection('测试 1: Constraint 接口');

  const hardConstraint: Constraint = {
    id: 'c-001',
    type: 'SAFETY_CRITICAL',
    hardness: 'HARD',
    description: 'F-Road 需要 4x4 车辆',
    value: { vehicle_type: '4x4', required: true },
    threshold: { min_clearance_cm: 20 },
    violation_action: 'BLOCK',
    evidence_refs: ['ev-road-001', 'ev-vehicle-001'],
  };

  assert(hardConstraint.id === 'c-001', 'Constraint id 应该正确');
  assert(hardConstraint.type === 'SAFETY_CRITICAL', 'Constraint type 应该正确');
  assert(hardConstraint.hardness === 'HARD', 'Constraint hardness 应该正确');
  assert(hardConstraint.violation_action === 'BLOCK', 'violation_action 应该正确');

  console.log(colors.green('✓ Constraint 硬约束创建成功'));
  console.log(`  ID: ${hardConstraint.id}`);
  console.log(`  Type: ${hardConstraint.type}`);
  console.log(`  Hardness: ${hardConstraint.hardness}`);
  console.log(`  Violation Action: ${hardConstraint.violation_action}`);

  const softConstraint: Constraint = {
    id: 'c-002',
    type: 'PREFERENCE',
    hardness: 'SOFT',
    description: '优先选择景观路线',
    violation_action: 'WARNING',
  };

  assert(softConstraint.hardness === 'SOFT', 'Soft constraint hardness 应该是 SOFT');
  console.log(colors.green('✓ Constraint 软约束创建成功'));

  // 测试所有 ConstraintType
  const allTypes: ConstraintType[] = [
    'REACHABILITY', 'SAFETY_CRITICAL', 'PHYSICAL_LIMIT', 'LEGAL',
    'DATA_CRITICAL', 'PREFERENCE', 'COMFORT', 'EXPERIENCE', 'COST'
  ];
  console.log(colors.green(`✓ 共支持 ${allTypes.length} 种约束类型`));
}

// ============================================================================
// 测试 2: TradeoffModel 接口
// ============================================================================

function testTradeoffModel() {
  printSection('测试 2: TradeoffModel 接口');

  const tradeoffs: TradeoffModel[] = [
    {
      dimension: 'TIME',
      weight: 0.25,
      current_value: 8,
      optimal_value: 6,
      acceptable_range: { min: 4, max: 12 },
      loss_function: 'linear: -5 points per hour over optimal',
    },
    {
      dimension: 'COST',
      weight: 0.25,
      current_value: 500,
      optimal_value: 400,
      acceptable_range: { min: 200, max: 1000 },
      loss_function: 'logarithmic: diminishing impact above optimal',
    },
    {
      dimension: 'EXPERIENCE',
      weight: 0.30,
      current_value: 85,
      optimal_value: 100,
      acceptable_range: { min: 50, max: 100 },
      loss_function: 'linear: direct mapping to quality score',
    },
    {
      dimension: 'RISK',
      weight: 0.20,
      current_value: 25,
      optimal_value: 10,
      acceptable_range: { min: 0, max: 50 },
      loss_function: 'exponential: risk amplifies near threshold',
    },
  ];

  // 验证权重总和为 1
  const totalWeight = tradeoffs.reduce((sum, t) => sum + t.weight, 0);
  assert(Math.abs(totalWeight - 1.0) < 0.001, '权重总和应该为 1');
  console.log(colors.green(`✓ 权重总和验证: ${totalWeight.toFixed(2)}`));

  for (const tradeoff of tradeoffs) {
    assert(tradeoff.dimension !== undefined, 'dimension 不能为空');
    assert(tradeoff.weight >= 0 && tradeoff.weight <= 1, 'weight 应在 0-1 之间');
    console.log(`  ${tradeoff.dimension}: weight=${tradeoff.weight}, current=${tradeoff.current_value}, optimal=${tradeoff.optimal_value}`);
  }
  console.log(colors.green('✓ TradeoffModel 所有维度创建成功'));
}

// ============================================================================
// 测试 3: UncertaintyProfile 接口
// ============================================================================

function testUncertaintyProfile() {
  printSection('测试 3: UncertaintyProfile 接口');

  const uncertainty: UncertaintyProfile = {
    confidence: 0.72,
    data_quality: 'MEDIUM',
    uncertainty_sources: [
      { source: 'Weather forecast (7+ days)', impact: 'HIGH', mitigation: 'Check closer to departure' },
      { source: 'Road conditions', impact: 'MEDIUM', mitigation: 'Monitor road.is' },
      { source: 'Accommodation availability', impact: 'LOW' },
    ],
    risk_distribution: {
      optimistic: 2,
      expected: 5,
      pessimistic: 12,
    },
  };

  assert(uncertainty.confidence >= 0 && uncertainty.confidence <= 1, 'confidence 应在 0-1 之间');
  assert(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].includes(uncertainty.data_quality), 'data_quality 应该有效');
  assert(uncertainty.uncertainty_sources.length > 0, '应该有不确定性来源');

  console.log(colors.green('✓ UncertaintyProfile 创建成功'));
  console.log(`  Confidence: ${(uncertainty.confidence * 100).toFixed(0)}%`);
  console.log(`  Data Quality: ${uncertainty.data_quality}`);
  console.log(`  Uncertainty Sources: ${uncertainty.uncertainty_sources.length}`);
  
  for (const source of uncertainty.uncertainty_sources) {
    console.log(`    - ${source.source} (Impact: ${source.impact})`);
    if (source.mitigation) {
      console.log(`      Mitigation: ${source.mitigation}`);
    }
  }

  if (uncertainty.risk_distribution) {
    console.log(`  Risk Distribution:`);
    console.log(`    Optimistic: ${uncertainty.risk_distribution.optimistic}`);
    console.log(`    Expected: ${uncertainty.risk_distribution.expected}`);
    console.log(`    Pessimistic: ${uncertainty.risk_distribution.pessimistic}`);
  }
}

// ============================================================================
// 测试 4: DecisionOption 接口
// ============================================================================

function testDecisionOption() {
  printSection('测试 4: DecisionOption 接口');

  const option: DecisionOption = {
    id: 'plan-scenic-route',
    name: 'Scenic Ring Road',
    description: 'Classic Iceland Ring Road with major highlights',
    tradeoffs: {
      time: { value: 75, unit: 'score', impact: 'Efficient pace with good coverage' },
      cost: { value: 60, currency: 'USD', impact: 'Mid-range accommodation and dining' },
      experience: { value: 90, description: 'High variety of landscapes and attractions' },
      risk: { value: 25, factors: ['Weather dependent', 'Some unpaved sections'] },
    },
    uncertainty: {
      confidence: 0.78,
      data_quality: 'HIGH',
      uncertainty_sources: [
        { source: 'Route data', impact: 'LOW' },
        { source: 'Weather', impact: 'MEDIUM' },
      ],
    },
    evidence_refs: ['ev-001', 'ev-002', 'ev-003'],
    constraint_satisfaction: [
      { constraint_id: 'c-001', satisfied: true },
      { constraint_id: 'c-002', satisfied: true },
      { constraint_id: 'c-003', satisfied: false, violation_severity: 'LOW', repair_suggestion: 'Add buffer time' },
    ],
    score: 78.5,
    ranking: 1,
  };

  assert(option.id !== '', 'id 不能为空');
  assert(option.tradeoffs.time !== undefined, '应该有 time tradeoff');
  assert(option.tradeoffs.cost !== undefined, '应该有 cost tradeoff');
  assert(option.tradeoffs.experience !== undefined, '应该有 experience tradeoff');
  assert(option.tradeoffs.risk !== undefined, '应该有 risk tradeoff');

  console.log(colors.green('✓ DecisionOption 创建成功'));
  console.log(`  ID: ${option.id}`);
  console.log(`  Name: ${option.name}`);
  console.log(`  Score: ${option.score}`);
  console.log(`  Ranking: #${option.ranking}`);
  console.log(`  Tradeoffs:`);
  console.log(`    TIME: ${option.tradeoffs.time.value} - ${option.tradeoffs.time.impact}`);
  console.log(`    COST: ${option.tradeoffs.cost.value} - ${option.tradeoffs.cost.impact}`);
  console.log(`    EXPERIENCE: ${option.tradeoffs.experience.value} - ${option.tradeoffs.experience.description}`);
  console.log(`    RISK: ${option.tradeoffs.risk.value} - ${option.tradeoffs.risk.factors.join(', ')}`);
  console.log(`  Constraints: ${option.constraint_satisfaction.filter(c => c.satisfied).length}/${option.constraint_satisfaction.length} satisfied`);
}

// ============================================================================
// 测试 5: DecisionNode 接口
// ============================================================================

function testDecisionNode() {
  printSection('测试 5: DecisionNode 接口');

  const decisionNode: DecisionNode = {
    id: 'dn-iceland-001',
    type: 'ROOT',
    name: 'Iceland Trip Route Decision',
    description: 'Main decision point for Iceland Ring Road trip route selection',
    context: {
      destination: 'Iceland',
      date_range: { start: '2026-06-15', end: '2026-06-22' },
      travelers: { count: 2, profile: 'couple, photography enthusiasts' },
      current_phase: 'PLAN_GEN',
    },
    constraints: {
      hard: [
        {
          id: 'c-h-001',
          type: 'REACHABILITY',
          hardness: 'HARD',
          description: 'Must complete ring road in given timeframe',
          violation_action: 'BLOCK',
        },
      ],
      soft: [
        {
          id: 'c-s-001',
          type: 'PREFERENCE',
          hardness: 'SOFT',
          description: 'Prefer scenic routes over highways',
          violation_action: 'WARNING',
        },
      ],
    },
    preferences: {
      pace: 'BALANCED',
      priority: 'EXPERIENCE',
      risk_tolerance: 'MEDIUM',
      custom: {
        photography_priority: true,
        early_morning_starts: true,
      },
    },
    options: [], // 会在 DecisionOutput 中填充
    tradeoff_model: [
      { dimension: 'TIME', weight: 0.20, current_value: 0, optimal_value: 100, acceptable_range: { min: 0, max: 100 }, loss_function: 'linear' },
      { dimension: 'COST', weight: 0.20, current_value: 0, optimal_value: 100, acceptable_range: { min: 0, max: 100 }, loss_function: 'linear' },
      { dimension: 'EXPERIENCE', weight: 0.40, current_value: 0, optimal_value: 100, acceptable_range: { min: 0, max: 100 }, loss_function: 'linear' },
      { dimension: 'RISK', weight: 0.20, current_value: 0, optimal_value: 0, acceptable_range: { min: 0, max: 50 }, loss_function: 'exponential' },
    ],
    overall_uncertainty: {
      confidence: 0.75,
      data_quality: 'MEDIUM',
      uncertainty_sources: [
        { source: 'Weather', impact: 'HIGH' },
        { source: 'Road conditions', impact: 'MEDIUM' },
      ],
    },
    decision: {
      selected_option_id: 'plan-scenic-route',
      reasoning: 'Best balance of experience and feasibility given weather conditions',
      alternatives_considered: ['plan-adventure-route', 'plan-relaxed-route'],
      user_judgment_required: [
        {
          question: 'How important is seeing the Northern Lights vs. summer midnight sun?',
          options: ['Northern Lights (winter)', 'Midnight Sun (summer)', 'Either is fine'],
          default: 'Midnight Sun (summer)',
          impact: 'Determines optimal travel dates',
        },
      ],
    },
    metadata: {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      decided_at: new Date().toISOString(),
      decided_by: 'SYSTEM',
      version: 1,
    },
  };

  assert(decisionNode.id !== '', 'id 不能为空');
  assert(['ROOT', 'BRANCH', 'LEAF'].includes(decisionNode.type), 'type 应该有效');
  assert(decisionNode.constraints.hard.length > 0 || decisionNode.constraints.soft.length > 0, '应该有约束');
  assert(decisionNode.tradeoff_model.length === 4, '应该有 4 个权衡维度');

  console.log(colors.green('✓ DecisionNode 创建成功'));
  console.log(`  ID: ${decisionNode.id}`);
  console.log(`  Type: ${decisionNode.type}`);
  console.log(`  Name: ${decisionNode.name}`);
  console.log(`  Context:`);
  console.log(`    Destination: ${decisionNode.context.destination}`);
  console.log(`    Date Range: ${decisionNode.context.date_range?.start} to ${decisionNode.context.date_range?.end}`);
  console.log(`    Travelers: ${decisionNode.context.travelers?.count} (${decisionNode.context.travelers?.profile})`);
  console.log(`  Constraints: ${decisionNode.constraints.hard.length} hard, ${decisionNode.constraints.soft.length} soft`);
  console.log(`  Preferences:`);
  console.log(`    Pace: ${decisionNode.preferences.pace}`);
  console.log(`    Priority: ${decisionNode.preferences.priority}`);
  console.log(`    Risk Tolerance: ${decisionNode.preferences.risk_tolerance}`);
  console.log(`  Decision:`);
  console.log(`    Selected: ${decisionNode.decision?.selected_option_id}`);
  console.log(`    Reasoning: ${decisionNode.decision?.reasoning}`);
  console.log(`    Decided By: ${decisionNode.metadata.decided_by}`);
}

// ============================================================================
// 测试 6: ComparisonMatrix 接口
// ============================================================================

function testComparisonMatrix() {
  printSection('测试 6: ComparisonMatrix 接口');

  const comparison: ComparisonMatrix = {
    plans: [
      { plan_id: 'plan-scenic', name: 'Scenic Route', summary: 'Classic Ring Road with highlights' },
      { plan_id: 'plan-adventure', name: 'Adventure Route', summary: 'Highland exploration with F-roads' },
      { plan_id: 'plan-relaxed', name: 'Relaxed Route', summary: 'Slow pace with spa experiences' },
    ],
    dimensions: ['TIME', 'COST', 'EXPERIENCE', 'RISK'],
    matrix: [
      {
        dimension: 'TIME',
        values: [
          { plan_id: 'plan-scenic', value: 75, display: '7 days', is_best: true },
          { plan_id: 'plan-adventure', value: 65, display: '8 days', is_best: false },
          { plan_id: 'plan-relaxed', value: 85, display: '6 days', is_best: false },
        ],
      },
      {
        dimension: 'COST',
        values: [
          { plan_id: 'plan-scenic', value: 70, display: '$2,500', is_best: false },
          { plan_id: 'plan-adventure', value: 55, display: '$3,200', is_best: false },
          { plan_id: 'plan-relaxed', value: 80, display: '$2,000', is_best: true },
        ],
      },
      {
        dimension: 'EXPERIENCE',
        values: [
          { plan_id: 'plan-scenic', value: 85, display: 'High variety', is_best: false },
          { plan_id: 'plan-adventure', value: 95, display: 'Unique', is_best: true },
          { plan_id: 'plan-relaxed', value: 70, display: 'Relaxing', is_best: false },
        ],
      },
      {
        dimension: 'RISK',
        values: [
          { plan_id: 'plan-scenic', value: 20, display: 'Low', is_best: true },
          { plan_id: 'plan-adventure', value: 45, display: 'Medium-High', is_best: false },
          { plan_id: 'plan-relaxed', value: 15, display: 'Very Low', is_best: false },
        ],
      },
    ],
    recommendation: {
      plan_id: 'plan-scenic',
      confidence: 0.78,
      reasoning: 'Best balance across all dimensions for the given preferences',
    },
  };

  assert(comparison.plans.length > 0, '应该有方案');
  assert(comparison.dimensions.length === 4, '应该有 4 个维度');
  assert(comparison.matrix.length === 4, '矩阵应该有 4 行');
  assert(comparison.recommendation.plan_id !== '', '应该有推荐');

  console.log(colors.green('✓ ComparisonMatrix 创建成功'));
  console.log(`  Plans: ${comparison.plans.map(p => p.name).join(', ')}`);
  console.log(`  Dimensions: ${comparison.dimensions.join(', ')}`);
  console.log('\n  Comparison Table:');
  console.log('  ' + '-'.repeat(56));
  console.log(`  | ${'Dimension'.padEnd(12)} | ${'Plan 1'.padEnd(12)} | ${'Plan 2'.padEnd(12)} | ${'Plan 3'.padEnd(12)} |`);
  console.log('  ' + '-'.repeat(56));
  
  for (const row of comparison.matrix) {
    const values = row.values.map(v => {
      const best = v.is_best ? '*' : ' ';
      return `${v.display}${best}`.padEnd(12);
    });
    console.log(`  | ${row.dimension.padEnd(12)} | ${values.join(' | ')} |`);
  }
  console.log('  ' + '-'.repeat(56));
  console.log(`  * = Best in dimension`);
  
  console.log(`\n  Recommendation: ${comparison.recommendation.plan_id}`);
  console.log(`  Confidence: ${(comparison.recommendation.confidence * 100).toFixed(0)}%`);
  console.log(`  Reasoning: ${comparison.recommendation.reasoning}`);
}

// ============================================================================
// 测试 7: DecisionOutput 接口（完整）
// ============================================================================

function testDecisionOutput() {
  printSection('测试 7: DecisionOutput 接口（完整）');

  // 构建完整的 DecisionOutput
  const output: DecisionOutput = {
    decision_node: {
      id: 'dn-001',
      type: 'ROOT',
      name: 'Iceland Trip Decision',
      description: 'Main route decision',
      context: {
        destination: 'Iceland',
        date_range: { start: '2026-06-15', end: '2026-06-22' },
        travelers: { count: 2, profile: 'couple' },
        current_phase: 'PLAN_GEN',
      },
      constraints: { hard: [], soft: [] },
      preferences: { pace: 'BALANCED', priority: 'EXPERIENCE', risk_tolerance: 'MEDIUM' },
      options: [],
      tradeoff_model: [],
      overall_uncertainty: { confidence: 0.75, data_quality: 'MEDIUM', uncertainty_sources: [] },
      metadata: { created_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: 1 },
    },
    ranked_plans: [
      {
        plan: {
          id: 'plan-1',
          name: 'Scenic Route',
          description: 'Classic Ring Road',
          tradeoffs: {
            time: { value: 75, unit: 'score', impact: 'Efficient' },
            cost: { value: 70, currency: 'USD', impact: 'Mid-range' },
            experience: { value: 90, description: 'High variety' },
            risk: { value: 20, factors: ['Weather'] },
          },
          uncertainty: { confidence: 0.8, data_quality: 'HIGH', uncertainty_sources: [] },
          evidence_refs: ['ev-001'],
          constraint_satisfaction: [],
          score: 82,
          ranking: 1,
        },
        rank: 1,
        uncertainty: { confidence: 0.8, data_quality: 'HIGH', uncertainty_sources: [] },
        tradeoffs: {
          TIME: { value: 75, impact: 'Efficient pace' },
          COST: { value: 70, impact: 'Mid-range budget' },
          EXPERIENCE: { value: 90, impact: 'High variety' },
          RISK: { value: 20, impact: 'Weather dependent' },
        },
        what_you_pay_for: 'Slightly longer travel time for scenic views',
        what_you_get: 'Classic Iceland experience with all major highlights',
      },
      {
        plan: {
          id: 'plan-2',
          name: 'Adventure Route',
          description: 'Highland exploration',
          tradeoffs: {
            time: { value: 65, unit: 'score', impact: 'More time needed' },
            cost: { value: 55, currency: 'USD', impact: 'Higher cost' },
            experience: { value: 95, description: 'Unique' },
            risk: { value: 40, factors: ['4x4 required', 'Weather'] },
          },
          uncertainty: { confidence: 0.65, data_quality: 'MEDIUM', uncertainty_sources: [] },
          evidence_refs: ['ev-002'],
          constraint_satisfaction: [],
          score: 75,
          ranking: 2,
        },
        rank: 2,
        uncertainty: { confidence: 0.65, data_quality: 'MEDIUM', uncertainty_sources: [] },
        tradeoffs: {
          TIME: { value: 65, impact: 'More time needed' },
          COST: { value: 55, impact: 'Higher cost for 4x4' },
          EXPERIENCE: { value: 95, impact: 'Unique highland experience' },
          RISK: { value: 40, impact: 'Weather and road conditions' },
        },
        what_you_pay_for: 'Higher cost and risk for unique experience',
        what_you_get: 'Unforgettable highland adventure',
      },
    ],
    comparison: {
      plans: [
        { plan_id: 'plan-1', name: 'Scenic Route', summary: 'Classic' },
        { plan_id: 'plan-2', name: 'Adventure Route', summary: 'Unique' },
      ],
      dimensions: ['TIME', 'COST', 'EXPERIENCE', 'RISK'],
      matrix: [],
      recommendation: {
        plan_id: 'plan-1',
        confidence: 0.78,
        reasoning: 'Best balance for given preferences',
      },
    },
    user_judgment_required: [
      {
        question: 'Are you willing to rent a 4x4 vehicle for highland routes?',
        context: 'Highland routes require 4x4 vehicles and are weather dependent',
        options: [
          { id: 'yes', label: 'Yes, adventure is worth it', impact: 'Unlocks highland routes' },
          { id: 'no', label: 'No, prefer paved roads', impact: 'Limits to coastal routes' },
        ],
        recommendation: 'no',
      },
    ],
    evidence_summary: {
      total_evidence: 15,
      verified: 12,
      unverified: 2,
      assumptions: 1,
    },
  };

  assert(output.decision_node !== undefined, '应该有 decision_node');
  assert(output.ranked_plans.length > 0, '应该有 ranked_plans');
  assert(output.comparison !== undefined, '应该有 comparison');
  assert(output.evidence_summary !== undefined, '应该有 evidence_summary');

  console.log(colors.green('✓ DecisionOutput 完整结构验证通过'));
  console.log(`  Decision Node: ${output.decision_node.name}`);
  console.log(`  Ranked Plans: ${output.ranked_plans.length}`);
  console.log(`  User Judgments Required: ${output.user_judgment_required.length}`);
  console.log(`  Evidence: ${output.evidence_summary.verified}/${output.evidence_summary.total_evidence} verified`);

  // 打印排名详情
  console.log('\n  Ranked Plans:');
  for (const plan of output.ranked_plans) {
    console.log(`    #${plan.rank}: ${plan.plan.name} (score: ${plan.plan.score})`);
    console.log(`      What you pay for: ${plan.what_you_pay_for}`);
    console.log(`      What you get: ${plan.what_you_get}`);
  }

  // 打印用户判断点
  if (output.user_judgment_required.length > 0) {
    console.log('\n  User Judgment Required:');
    for (const judgment of output.user_judgment_required) {
      console.log(`    Q: ${judgment.question}`);
      console.log(`    Options: ${judgment.options.map(o => o.label).join(' | ')}`);
    }
  }
}

// ============================================================================
// 主程序
// ============================================================================

function main() {
  console.log(colors.bold('\n' + '='.repeat(60)));
  console.log(colors.bold('Decision Node 接口测试'));
  console.log(colors.bold('='.repeat(60)));

  let passed = 0;
  let failed = 0;

  const tests = [
    { name: 'Constraint', fn: testConstraint },
    { name: 'TradeoffModel', fn: testTradeoffModel },
    { name: 'UncertaintyProfile', fn: testUncertaintyProfile },
    { name: 'DecisionOption', fn: testDecisionOption },
    { name: 'DecisionNode', fn: testDecisionNode },
    { name: 'ComparisonMatrix', fn: testComparisonMatrix },
    { name: 'DecisionOutput', fn: testDecisionOutput },
  ];

  for (const test of tests) {
    try {
      test.fn();
      passed++;
    } catch (error: any) {
      failed++;
      console.log(colors.red(`\n✗ ${test.name} 测试失败: ${error.message}`));
    }
  }

  console.log('\n' + colors.bold('='.repeat(60)));
  console.log(colors.bold('测试结果汇总'));
  console.log('='.repeat(60));
  console.log(`  总测试数: ${tests.length}`);
  console.log(`  ${colors.green('通过')}: ${passed}`);
  console.log(`  ${colors.red('失败')}: ${failed}`);

  if (failed === 0) {
    console.log(colors.green('\n✓ 所有 Decision Node 接口测试通过！'));
  } else {
    console.log(colors.red(`\n✗ ${failed} 个测试失败`));
    process.exit(1);
  }
}

main();
