"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPlanningActions = createPlanningActions;
const action_interface_1 = require("../../interfaces/action.interface");
function createPlanningActions(planningWorkbenchAgent) {
    return [
        {
            name: 'planning.workbench.generate',
            description: '生成行程骨架方案（规划工作台）',
            metadata: {
                kind: action_interface_1.ActionKind.INTERNAL,
                cost: action_interface_1.ActionCost.MEDIUM,
                side_effect: action_interface_1.ActionSideEffect.NONE,
                preconditions: ['planning.context'],
                idempotent: false,
                cacheable: false,
            },
            input_schema: {
                type: 'object',
                properties: {
                    context: {
                        type: 'object',
                        properties: {
                            destination: { type: 'object' },
                            days: { type: 'number' },
                            travelMode: { type: 'string' },
                            constraints: { type: 'object' },
                        },
                        required: ['destination', 'days'],
                    },
                    tripId: { type: 'string' },
                    userAction: { type: 'string', enum: ['generate', 'compare', 'commit', 'adjust'] },
                },
                required: ['context'],
            },
            output_schema: {
                type: 'object',
                properties: {
                    planState: { type: 'object' },
                    uiOutput: {
                        type: 'object',
                        properties: {
                            personas: { type: 'object' },
                            consolidatedDecision: { type: 'object' },
                        },
                    },
                },
            },
            execute: async (input, state) => {
                var _a;
                const request = {
                    context: input.context,
                    tripId: input.tripId || ((_a = state.trip) === null || _a === void 0 ? void 0 : _a.trip_id),
                    userAction: input.userAction || 'generate',
                };
                const result = await planningWorkbenchAgent.execute(request);
                return result;
            },
        },
        {
            name: 'planning.workbench.compare',
            description: '对比多个行程骨架方案',
            metadata: {
                kind: action_interface_1.ActionKind.INTERNAL,
                cost: action_interface_1.ActionCost.MEDIUM,
                side_effect: action_interface_1.ActionSideEffect.NONE,
                preconditions: ['planning.options'],
                idempotent: false,
                cacheable: false,
            },
            input_schema: {
                type: 'object',
                properties: {
                    options: { type: 'array' },
                    context: { type: 'object' },
                },
                required: ['options'],
            },
            output_schema: {
                type: 'object',
                properties: {
                    comparison: { type: 'object' },
                },
            },
            execute: async (input, state) => {
                var _a;
                const request = {
                    context: input.context || {},
                    tripId: (_a = state.trip) === null || _a === void 0 ? void 0 : _a.trip_id,
                    userAction: 'compare',
                };
                const result = await planningWorkbenchAgent.execute(request);
                return result;
            },
        },
    ];
}
//# sourceMappingURL=planning.actions.js.map