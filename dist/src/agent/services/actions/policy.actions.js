"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPolicyActions = createPolicyActions;
const action_interface_1 = require("../../interfaces/action.interface");
function createPolicyActions(feasibilityService) {
    return [
        {
            name: 'policy.validate_feasibility',
            description: '验证行程的可行性（时间窗、日界、午餐等）',
            metadata: {
                kind: action_interface_1.ActionKind.INTERNAL,
                cost: action_interface_1.ActionCost.LOW,
                side_effect: action_interface_1.ActionSideEffect.NONE,
                preconditions: ['result.timeline'],
                idempotent: true,
                cacheable: true,
            },
            input_schema: {
                type: 'object',
                properties: {
                    timeline: { type: 'array' },
                    policy: { type: 'object' },
                },
                required: ['timeline'],
            },
            output_schema: {
                type: 'object',
                properties: {
                    pass: { type: 'boolean' },
                    violations: { type: 'array' },
                },
            },
            execute: async (input, state) => {
                var _a, _b, _c;
                const parseTime = (timeStr) => {
                    const [hours, minutes] = timeStr.split(':').map(Number);
                    return hours * 60 + minutes;
                };
                try {
                    const violations = [];
                    const timeline = input.timeline || [];
                    const policy = input.policy || ((_b = (_a = state.memory) === null || _a === void 0 ? void 0 : _a.user_profile) === null || _b === void 0 ? void 0 : _b.policy);
                    for (const event of timeline) {
                        if (event.type === 'NODE' && event.node_id) {
                            if (event.wait_min && event.wait_min > 60) {
                                violations.push({
                                    type: 'HIGH_WAIT_TIME',
                                    message: `节点 ${event.node_id} 等待时间过长：${event.wait_min} 分钟`,
                                    node_id: event.node_id,
                                    details: { wait_min: event.wait_min },
                                });
                            }
                        }
                    }
                    const dayBoundary = (_c = state.trip.day_boundaries) === null || _c === void 0 ? void 0 : _c[0];
                    if (dayBoundary && timeline.length > 0) {
                        const lastEvent = timeline[timeline.length - 1];
                        const endTime = parseTime(lastEvent.end || lastEvent.start);
                        const dayEnd = parseTime(dayBoundary.end);
                        if (endTime > dayEnd) {
                            violations.push({
                                type: 'DAY_BOUNDARY_VIOLATION',
                                message: `行程结束时间 ${lastEvent.end} 超过了日界 ${dayBoundary.end}`,
                                details: { endTime: lastEvent.end, dayEnd: dayBoundary.end },
                            });
                        }
                    }
                    const lunchBreak = state.trip.lunch_break;
                    if (lunchBreak === null || lunchBreak === void 0 ? void 0 : lunchBreak.enabled) {
                        const lunchEvents = timeline.filter((e) => e.type === 'LUNCH');
                        if (lunchEvents.length === 0) {
                            violations.push({
                                type: 'LUNCH_MISSING',
                                message: '缺少午餐休息时间',
                            });
                        }
                        else if (lunchEvents.length > 1) {
                            violations.push({
                                type: 'LUNCH_MULTIPLE',
                                message: `午餐休息时间过多：${lunchEvents.length} 个`,
                            });
                        }
                        else {
                            const lunch = lunchEvents[0];
                            const lunchStart = parseTime(lunch.start);
                            const windowStart = parseTime(lunchBreak.window[0]);
                            const windowEnd = parseTime(lunchBreak.window[1]);
                            if (lunchStart < windowStart || lunchStart > windowEnd) {
                                violations.push({
                                    type: 'LUNCH_WINDOW_VIOLATION',
                                    message: `午餐时间 ${lunch.start} 不在窗口 [${lunchBreak.window[0]}, ${lunchBreak.window[1]}] 内`,
                                    details: { lunchTime: lunch.start, window: lunchBreak.window },
                                });
                            }
                        }
                    }
                    return {
                        pass: violations.length === 0,
                        violations,
                    };
                }
                catch (error) {
                    throw new Error(`可行性验证失败: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`);
                }
            },
        },
        {
            name: 'policy.score_robustness',
            description: '评估行程的稳健度',
            metadata: {
                kind: action_interface_1.ActionKind.INTERNAL,
                cost: action_interface_1.ActionCost.LOW,
                side_effect: action_interface_1.ActionSideEffect.NONE,
                preconditions: ['result.timeline'],
                idempotent: true,
                cacheable: true,
            },
            input_schema: {
                type: 'object',
                properties: {
                    timeline: { type: 'array' },
                },
                required: ['timeline'],
            },
            output_schema: {
                type: 'object',
                properties: {
                    score: { type: 'number' },
                    metrics: { type: 'object' },
                },
            },
            execute: async (input, state) => {
                try {
                    const timeline = input.timeline || [];
                    let totalWait = 0;
                    let minSlack = Infinity;
                    for (const event of timeline) {
                        if (event.wait_min) {
                            totalWait += event.wait_min;
                        }
                        if (event.slack_min !== undefined) {
                            minSlack = Math.min(minSlack, event.slack_min);
                        }
                    }
                    const waitScore = Math.max(0, 1 - totalWait / 120);
                    const slackScore = Math.min(1, minSlack / 30);
                    const score = (waitScore + slackScore) / 2;
                    return {
                        score,
                        metrics: {
                            total_wait_minutes: totalWait,
                            min_slack_minutes: minSlack === Infinity ? undefined : minSlack,
                        },
                    };
                }
                catch (error) {
                    throw new Error(`稳健度评估失败: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`);
                }
            },
        },
    ];
}
//# sourceMappingURL=policy.actions.js.map