"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("../src/app.module");
const core_decision_agent_service_1 = require("../src/agent/services/sub-agents/core-decision-agent.service");
function createItem(name, durationMin, category) {
    return {
        id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'VISIT',
        start_window: '09:00',
        end_window: '18:00',
        location_ref: { name, coordinates: { lat: 64.0, lng: -20.0 } },
        notes: category,
        evidence_refs: [],
        verified: true,
        metadata: { duration_minutes: durationMin },
    };
}
const mockItineraries = [
    {
        itinerary: {
            request_id: 'plan-scenic-route',
            days: [
                {
                    date: '2026-06-15',
                    items: [
                        createItem('Þingvellir National Park', 90, 'nature'),
                        createItem('Geysir Geothermal Area', 60, 'nature'),
                        createItem('Gullfoss Waterfall', 45, 'nature'),
                    ],
                },
                {
                    date: '2026-06-16',
                    items: [
                        createItem('Seljalandsfoss', 45, 'nature'),
                        createItem('Skógafoss', 60, 'nature'),
                        createItem('Reynisfjara Black Beach', 60, 'nature'),
                    ],
                },
            ],
            metadata: { total_days: 2, total_cost_estimate: 500 },
        },
        score: 85,
        pros: ['Scenic highlights', 'Classic route', 'Good photo opportunities'],
        cons: ['Popular tourist spots', 'Higher accommodation cost'],
        evidence_refs: ['ev-route-001', 'ev-weather-001'],
    },
    {
        itinerary: {
            request_id: 'plan-adventure-route',
            days: [
                {
                    date: '2026-06-15',
                    items: [
                        createItem('Landmannalaugar', 180, 'adventure'),
                        createItem('F-Road Experience', 120, 'adventure'),
                    ],
                },
                {
                    date: '2026-06-16',
                    items: [
                        createItem('Glacier Hike', 240, 'adventure'),
                        createItem('Ice Cave', 90, 'adventure'),
                    ],
                },
            ],
            metadata: { total_days: 2, total_cost_estimate: 800 },
        },
        score: 78,
        pros: ['Unique experience', 'Less crowded', 'Adventure activities'],
        cons: ['Requires 4x4', 'Weather dependent', 'More challenging'],
        evidence_refs: ['ev-route-002', 'ev-road-001'],
    },
    {
        itinerary: {
            request_id: 'plan-relaxed-route',
            days: [
                {
                    date: '2026-06-15',
                    items: [
                        createItem('Reykjavik City Walk', 120, 'culture'),
                        createItem('Blue Lagoon', 180, 'relaxation'),
                    ],
                },
                {
                    date: '2026-06-16',
                    items: [
                        createItem('Kirkjufell', 60, 'nature'),
                        createItem('Arnarstapi', 90, 'nature'),
                    ],
                },
            ],
            metadata: { total_days: 2, total_cost_estimate: 600 },
        },
        score: 72,
        pros: ['Relaxed pace', 'Spa experience', 'Easy driving'],
        cons: ['Fewer highlights', 'Higher spa cost'],
        evidence_refs: ['ev-route-003'],
    },
];
const mockRequest = {
    request_id: 'test-request-001',
    destination: 'Iceland',
    travel_dates: {
        start: '2026-06-15',
        end: '2026-06-20',
    },
    travelers: {
        count: 2,
        profile: 'couple',
    },
};
const mockContext = {
    request_id: 'test-request-001',
    current_step: 'PLAN_GEN',
    decision_log: [],
    research_data: {},
    gate_result: {
        gate_result: 'ALLOW',
        violations: [],
        required_adjustments: [],
        confidence: 0.85,
    },
};
async function testDecisionNodeInterface() {
    console.log('='.repeat(70));
    console.log('Decision Node 接口测试');
    console.log('='.repeat(70));
    let app;
    try {
        console.log('\n[1/6] 初始化 NestJS 应用...');
        app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule, {
            logger: ['error', 'warn'],
        });
        console.log('✓ NestJS 应用初始化成功');
        console.log('\n[2/6] 获取 CoreDecision Agent 服务...');
        const coreDecisionAgent = app.get(core_decision_agent_service_1.ClaudeCoreDecisionAgentService);
        console.log('✓ CoreDecision Agent 获取成功');
        console.log('\n[3/6] 测试 analyzeDecision 方法...');
        const decisionOutput = await coreDecisionAgent.analyzeDecision(mockItineraries, mockRequest, mockContext, {
            priority: 'EXPERIENCE',
            risk_tolerance: 'MEDIUM',
        });
        console.log('✓ analyzeDecision 执行成功');
        console.log('\n[4/6] 验证 DecisionOutput 结构...');
        validateDecisionOutput(decisionOutput);
        console.log('✓ DecisionOutput 结构验证通过');
        console.log('\n[5/6] 决策分析结果：');
        printDecisionOutput(decisionOutput);
        console.log('\n[6/6] 测试不同用户偏好...');
        await testDifferentPreferences(coreDecisionAgent);
        console.log('\n' + '='.repeat(70));
        console.log('✓ 所有测试通过！');
        console.log('='.repeat(70));
    }
    catch (error) {
        console.error('\n✗ 测试失败:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
    finally {
        if (app) {
            await app.close();
        }
    }
}
function validateDecisionOutput(output) {
    if (!output.decision_node) {
        throw new Error('缺少 decision_node');
    }
    if (!output.decision_node.id) {
        throw new Error('decision_node 缺少 id');
    }
    if (!['ROOT', 'BRANCH', 'LEAF'].includes(output.decision_node.type)) {
        throw new Error('decision_node.type 无效');
    }
    if (!Array.isArray(output.ranked_plans) || output.ranked_plans.length === 0) {
        throw new Error('ranked_plans 应该是非空数组');
    }
    for (const plan of output.ranked_plans) {
        if (!plan.plan || !plan.rank || !plan.tradeoffs) {
            throw new Error('ranked_plans 项缺少必要字段');
        }
        const dimensions = ['TIME', 'COST', 'EXPERIENCE', 'RISK'];
        for (const dim of dimensions) {
            if (!plan.tradeoffs[dim]) {
                throw new Error(`tradeoffs 缺少 ${dim} 维度`);
            }
        }
    }
    if (!output.comparison || !output.comparison.matrix) {
        throw new Error('缺少 comparison 或 comparison.matrix');
    }
    if (!Array.isArray(output.user_judgment_required)) {
        throw new Error('user_judgment_required 应该是数组');
    }
    if (!output.evidence_summary) {
        throw new Error('缺少 evidence_summary');
    }
    console.log('  - decision_node: ✓');
    console.log('  - ranked_plans: ✓ (' + output.ranked_plans.length + ' 个方案)');
    console.log('  - comparison: ✓');
    console.log('  - user_judgment_required: ✓ (' + output.user_judgment_required.length + ' 个判断点)');
    console.log('  - evidence_summary: ✓');
}
function printDecisionOutput(output) {
    console.log('\n--- Decision Node ---');
    console.log(`ID: ${output.decision_node.id}`);
    console.log(`Type: ${output.decision_node.type}`);
    console.log(`Name: ${output.decision_node.name}`);
    console.log('\n--- Ranked Plans ---');
    for (const plan of output.ranked_plans) {
        console.log(`\n#${plan.rank}: ${plan.plan.name}`);
        console.log(`  Score: ${plan.plan.score.toFixed(1)}`);
        console.log(`  Tradeoffs:`);
        console.log(`    TIME: ${plan.tradeoffs.TIME.value} - ${plan.tradeoffs.TIME.impact}`);
        console.log(`    COST: ${plan.tradeoffs.COST.value} - ${plan.tradeoffs.COST.impact}`);
        console.log(`    EXPERIENCE: ${plan.tradeoffs.EXPERIENCE.value} - ${plan.tradeoffs.EXPERIENCE.impact}`);
        console.log(`    RISK: ${plan.tradeoffs.RISK.value} - ${plan.tradeoffs.RISK.impact}`);
        console.log(`  What you pay for: ${plan.what_you_pay_for}`);
        console.log(`  What you get: ${plan.what_you_get}`);
    }
    console.log('\n--- Comparison Matrix ---');
    console.log(`Plans: ${output.comparison.plans.map(p => p.name).join(' vs ')}`);
    console.log(`Recommendation: ${output.comparison.recommendation.plan_id} (confidence: ${output.comparison.recommendation.confidence})`);
    console.log(`Reasoning: ${output.comparison.recommendation.reasoning}`);
    if (output.user_judgment_required.length > 0) {
        console.log('\n--- User Judgment Required ---');
        for (const judgment of output.user_judgment_required) {
            console.log(`Q: ${judgment.question}`);
            console.log(`  Context: ${judgment.context}`);
            console.log(`  Options: ${judgment.options.map(o => o.label).join(', ')}`);
            if (judgment.recommendation) {
                console.log(`  Recommended: ${judgment.recommendation}`);
            }
        }
    }
    console.log('\n--- Evidence Summary ---');
    console.log(`Total: ${output.evidence_summary.total_evidence}`);
    console.log(`Verified: ${output.evidence_summary.verified}`);
    console.log(`Unverified: ${output.evidence_summary.unverified}`);
    console.log(`Assumptions: ${output.evidence_summary.assumptions}`);
}
async function testDifferentPreferences(agent) {
    const preferences = [
        { name: 'Time Priority', priority: 'TIME', risk_tolerance: 'HIGH' },
        { name: 'Cost Priority', priority: 'COST', risk_tolerance: 'LOW' },
        { name: 'Experience Priority', priority: 'EXPERIENCE', risk_tolerance: 'MEDIUM' },
    ];
    console.log('\n不同偏好下的排名变化：');
    console.log('-'.repeat(60));
    for (const pref of preferences) {
        const output = await agent.analyzeDecision(mockItineraries, mockRequest, mockContext, { priority: pref.priority, risk_tolerance: pref.risk_tolerance });
        const topPlan = output.ranked_plans[0];
        console.log(`\n${pref.name} (Risk: ${pref.risk_tolerance}):`);
        console.log(`  Top choice: ${topPlan.plan.name} (score: ${topPlan.plan.score.toFixed(1)})`);
        console.log(`  Ranking: ${output.ranked_plans.map((p, i) => `${i + 1}.${p.plan.name.split(' ')[0]}`).join(' > ')}`);
    }
}
function testInterfaceStructure() {
    var _a;
    console.log('\n' + '='.repeat(70));
    console.log('接口结构独立测试');
    console.log('='.repeat(70));
    console.log('\n[1] 测试 Constraint 接口...');
    const constraint = {
        id: 'c-001',
        type: 'SAFETY_CRITICAL',
        hardness: 'HARD',
        description: 'F-Road 需要 4x4 车辆',
        value: { vehicle_type: '4x4' },
        violation_action: 'BLOCK',
        evidence_refs: ['ev-001'],
    };
    console.log('✓ Constraint 结构有效');
    console.log(`  示例: ${JSON.stringify(constraint, null, 2)}`);
    console.log('\n[2] 测试 UncertaintyProfile 接口...');
    const uncertainty = {
        confidence: 0.75,
        data_quality: 'MEDIUM',
        uncertainty_sources: [
            { source: 'Weather forecast', impact: 'HIGH', mitigation: 'Check closer to date' },
            { source: 'Road conditions', impact: 'MEDIUM' },
        ],
        risk_distribution: {
            optimistic: 2,
            expected: 4,
            pessimistic: 8,
        },
    };
    console.log('✓ UncertaintyProfile 结构有效');
    console.log(`  Confidence: ${uncertainty.confidence}`);
    console.log(`  Data Quality: ${uncertainty.data_quality}`);
    console.log(`  Sources: ${uncertainty.uncertainty_sources.length}`);
    console.log('\n[3] 测试 DecisionNode 接口...');
    const decisionNode = {
        id: 'dn-001',
        type: 'ROOT',
        name: 'Iceland Trip Planning',
        description: 'Main decision for Iceland trip',
        context: {
            destination: 'Iceland',
            date_range: { start: '2026-06-15', end: '2026-06-20' },
            travelers: { count: 2, profile: 'couple' },
            current_phase: 'PLAN_GEN',
        },
        constraints: {
            hard: [constraint],
            soft: [],
        },
        preferences: {
            pace: 'BALANCED',
            priority: 'EXPERIENCE',
            risk_tolerance: 'MEDIUM',
        },
        overall_uncertainty: uncertainty,
        metadata: {
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            version: 1,
        },
    };
    console.log('✓ DecisionNode 结构有效');
    console.log(`  ID: ${decisionNode.id}`);
    console.log(`  Type: ${decisionNode.type}`);
    console.log(`  Hard Constraints: ${(_a = decisionNode.constraints) === null || _a === void 0 ? void 0 : _a.hard.length}`);
    console.log('\n✓ 所有接口结构测试通过！');
}
async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--structure-only')) {
        testInterfaceStructure();
    }
    else {
        await testDecisionNodeInterface();
    }
}
main().catch(console.error);
//# sourceMappingURL=test-decision-node-interface.js.map