"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createExecutionActions = createExecutionActions;
const action_interface_1 = require("../../interfaces/action.interface");
function createExecutionActions(executionAgent) {
    return [
        {
            name: 'execution.remind',
            description: '生成执行阶段的提醒（出发、入住、活动、交通、天气、安全、预算）',
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
                    reminderTypes: { type: 'array', items: { type: 'string' } },
                    advanceHours: { type: 'number' },
                },
                required: ['tripId'],
            },
            output_schema: {
                type: 'object',
                properties: {
                    reminders: { type: 'array' },
                },
            },
            execute: async (input, state) => {
                var _a;
                const request = {
                    tripId: input.tripId || ((_a = state.trip) === null || _a === void 0 ? void 0 : _a.trip_id),
                    action: 'remind',
                    remindParams: {
                        reminderTypes: input.reminderTypes,
                        advanceHours: input.advanceHours,
                    },
                };
                const result = await executionAgent.execute(request);
                return result.uiOutput;
            },
        },
        {
            name: 'execution.handle_change',
            description: '处理执行期间的变更（时间、地点、活动取消、交通延误等）',
            metadata: {
                kind: action_interface_1.ActionKind.INTERNAL,
                cost: action_interface_1.ActionCost.MEDIUM,
                side_effect: action_interface_1.ActionSideEffect.WRITES_DB,
                preconditions: ['trip.trip_id', 'execution.change'],
                idempotent: false,
                cacheable: false,
            },
            input_schema: {
                type: 'object',
                properties: {
                    tripId: { type: 'string' },
                    changeType: { type: 'string' },
                    changeDetails: { type: 'object' },
                },
                required: ['tripId', 'changeType', 'changeDetails'],
            },
            output_schema: {
                type: 'object',
                properties: {
                    changeResult: { type: 'object' },
                },
            },
            execute: async (input, state) => {
                var _a;
                const request = {
                    tripId: input.tripId || ((_a = state.trip) === null || _a === void 0 ? void 0 : _a.trip_id),
                    action: 'handle_change',
                    changeParams: {
                        changeType: input.changeType,
                        changeDetails: input.changeDetails,
                    },
                };
                const result = await executionAgent.execute(request);
                return result.uiOutput;
            },
        },
    ];
}
//# sourceMappingURL=execution.actions.js.map