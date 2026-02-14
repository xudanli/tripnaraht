"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createItineraryActions = createItineraryActions;
const action_interface_1 = require("../../interfaces/action.interface");
function createItineraryActions(vrptwOptimizer) {
    return [
        {
            name: 'itinerary.optimize_day_vrptw',
            description: '使用 VRPTW 算法优化单日行程',
            metadata: {
                kind: action_interface_1.ActionKind.INTERNAL,
                cost: action_interface_1.ActionCost.HIGH,
                side_effect: action_interface_1.ActionSideEffect.NONE,
                preconditions: ['draft.nodes', 'compute.time_matrix_robust', 'memory.semantic_facts.pois'],
                idempotent: true,
                cacheable: false,
            },
            input_schema: {
                type: 'object',
                properties: {
                    nodes: { type: 'array' },
                    time_matrix: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
                    trip: { type: 'object' },
                },
                required: ['nodes', 'time_matrix'],
            },
            output_schema: {
                type: 'object',
                properties: {
                    results: { type: 'array' },
                    timeline: { type: 'array' },
                    dropped_items: { type: 'array' },
                },
            },
            execute: async (input, state) => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j;
                if (!((_b = (_a = state.memory) === null || _a === void 0 ? void 0 : _a.semantic_facts) === null || _b === void 0 ? void 0 : _b.pois) || state.memory.semantic_facts.pois.length === 0) {
                    throw new Error('PRECONDITION_FAILED: FACTS_MISSING - places.get_poi_facts must be executed first');
                }
                try {
                    const planNodes = input.nodes.map((node, index) => {
                        var _a, _b, _c;
                        return ({
                            id: node.id,
                            name: node.name || `Node ${index + 1}`,
                            type: node.type || 'poi',
                            service_duration_min: node.service_duration_min || 60,
                            time_windows: node.time_windows || undefined,
                            constraints: {
                                is_hard_node: ((_a = node.constraints) === null || _a === void 0 ? void 0 : _a.is_hard_node) || false,
                                priority_level: ((_b = node.constraints) === null || _b === void 0 ? void 0 : _b.priority_level) || 3,
                                drop_penalty: (_c = node.constraints) === null || _c === void 0 ? void 0 : _c.drop_penalty,
                            },
                            geo: node.geo,
                            meta: node.meta,
                        });
                    });
                    const trip = input.trip || state.trip;
                    const dayBoundary = ((_c = trip.day_boundaries) === null || _c === void 0 ? void 0 : _c[0]) || { start: '10:00', end: '22:00' };
                    const planRequest = {
                        date: new Date().toISOString().split('T')[0],
                        timezone: 'Asia/Shanghai',
                        day_boundary: {
                            start: dayBoundary.start,
                            end: dayBoundary.end,
                        },
                        start: {
                            node_id: ((_d = planNodes[0]) === null || _d === void 0 ? void 0 : _d.id) || 0,
                            name: ((_e = planNodes[0]) === null || _e === void 0 ? void 0 : _e.name) || 'Start',
                            geo: ((_f = planNodes[0]) === null || _f === void 0 ? void 0 : _f.geo) || { lat: 0, lng: 0 },
                        },
                        end: {
                            node_id: ((_g = planNodes[planNodes.length - 1]) === null || _g === void 0 ? void 0 : _g.id) || 0,
                            same_as_start: false,
                            name: ((_h = planNodes[planNodes.length - 1]) === null || _h === void 0 ? void 0 : _h.name) || 'End',
                            geo: ((_j = planNodes[planNodes.length - 1]) === null || _j === void 0 ? void 0 : _j.geo) || { lat: 0, lng: 0 },
                        },
                        nodes: planNodes,
                        transport_policy: {
                            buffer_factor: 1.2,
                            fixed_buffer_min: 15,
                        },
                        lifestyle_policy: {
                            lunch_break: trip.lunch_break || {
                                enabled: true,
                                duration_min: 60,
                                window: ['11:30', '13:30'],
                            },
                        },
                        pacing: trip.pacing || 'normal',
                    };
                    const result = await vrptwOptimizer.solve(planRequest);
                    const timeline = result.timeline || [];
                    const droppedItems = result.dropped.map((d) => ({
                        id: d.node_id,
                        name: d.name,
                        reason_code: d.reason_code,
                        facts: d.explanation.facts,
                        explanation: d.explanation.text,
                    }));
                    return {
                        results: [result],
                        timeline,
                        dropped_items: droppedItems,
                    };
                }
                catch (error) {
                    throw new Error(`行程优化失败: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`);
                }
            },
        },
        {
            name: 'itinerary.repair_cross_day',
            description: '修复跨天问题（交换节点顺序、移动节点等）',
            metadata: {
                kind: action_interface_1.ActionKind.INTERNAL,
                cost: action_interface_1.ActionCost.MEDIUM,
                side_effect: action_interface_1.ActionSideEffect.NONE,
                preconditions: ['result.timeline'],
                idempotent: false,
                cacheable: false,
            },
            input_schema: {
                type: 'object',
                properties: {
                    violations: { type: 'array' },
                },
                required: ['violations'],
            },
            output_schema: {
                type: 'object',
                properties: {
                    repaired: { type: 'boolean' },
                    timeline: { type: 'array' },
                },
            },
            execute: async (input, state) => {
                try {
                    const timeline = state.result.timeline || [];
                    const timeWindowViolations = input.violations.filter((v) => v.type === 'TIME_WINDOW_CONFLICT');
                    if (timeWindowViolations.length > 0) {
                        if (timeline.length >= 2) {
                            const newTimeline = [...timeline];
                            [newTimeline[0], newTimeline[1]] = [newTimeline[1], newTimeline[0]];
                            return {
                                repaired: true,
                                timeline: newTimeline,
                            };
                        }
                    }
                    return {
                        repaired: false,
                        timeline,
                    };
                }
                catch (error) {
                    throw new Error(`修复失败: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`);
                }
            },
        },
    ];
}
//# sourceMappingURL=itinerary.actions.js.map