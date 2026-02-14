"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTripDetailActions = createTripDetailActions;
const action_interface_1 = require("../../interfaces/action.interface");
function createTripDetailActions(tripDetailAgent) {
    return [
        {
            name: 'trip.detail.get_status',
            description: '理解当前行程状态（规划中/进行中/已完成）',
            metadata: {
                kind: action_interface_1.ActionKind.INTERNAL,
                cost: action_interface_1.ActionCost.LOW,
                side_effect: action_interface_1.ActionSideEffect.NONE,
                preconditions: ['trip.trip_id'],
                idempotent: true,
                cacheable: true,
            },
            input_schema: {
                type: 'object',
                properties: {
                    tripId: { type: 'string' },
                },
                required: ['tripId'],
            },
            output_schema: {
                type: 'object',
                properties: {
                    status: { type: 'object' },
                },
            },
            execute: async (input, state) => {
                var _a;
                const request = {
                    tripId: input.tripId || ((_a = state.trip) === null || _a === void 0 ? void 0 : _a.trip_id),
                    action: 'get_status',
                };
                const result = await tripDetailAgent.execute(request);
                return result.uiOutput;
            },
        },
        {
            name: 'trip.detail.get_health',
            description: '分析行程健康度（时间、预算、节奏、可达性）',
            metadata: {
                kind: action_interface_1.ActionKind.INTERNAL,
                cost: action_interface_1.ActionCost.LOW,
                side_effect: action_interface_1.ActionSideEffect.NONE,
                preconditions: ['trip.trip_id'],
                idempotent: true,
                cacheable: true,
            },
            input_schema: {
                type: 'object',
                properties: {
                    tripId: { type: 'string' },
                },
                required: ['tripId'],
            },
            output_schema: {
                type: 'object',
                properties: {
                    health: { type: 'object' },
                },
            },
            execute: async (input, state) => {
                var _a;
                const request = {
                    tripId: input.tripId || ((_a = state.trip) === null || _a === void 0 ? void 0 : _a.trip_id),
                    action: 'get_health',
                };
                const result = await tripDetailAgent.execute(request);
                return result.uiOutput;
            },
        },
        {
            name: 'trip.detail.explain_decisions',
            description: '解释决策（基于决策日志）',
            metadata: {
                kind: action_interface_1.ActionKind.INTERNAL,
                cost: action_interface_1.ActionCost.MEDIUM,
                side_effect: action_interface_1.ActionSideEffect.NONE,
                preconditions: ['trip.trip_id'],
                idempotent: true,
                cacheable: true,
            },
            input_schema: {
                type: 'object',
                properties: {
                    tripId: { type: 'string' },
                    decisionId: { type: 'string' },
                },
                required: ['tripId'],
            },
            output_schema: {
                type: 'object',
                properties: {
                    explanations: { type: 'array' },
                },
            },
            execute: async (input, state) => {
                var _a;
                const request = {
                    tripId: input.tripId || ((_a = state.trip) === null || _a === void 0 ? void 0 : _a.trip_id),
                    action: 'explain_decisions',
                    decisionId: input.decisionId,
                };
                const result = await tripDetailAgent.execute(request);
                return result.uiOutput;
            },
        },
    ];
}
//# sourceMappingURL=trip-detail.actions.js.map