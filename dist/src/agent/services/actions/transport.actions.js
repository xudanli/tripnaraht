"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTransportActions = createTransportActions;
const action_interface_1 = require("../../interfaces/action.interface");
function createTransportActions(transportRoutingService) {
    return [
        {
            name: 'transport.build_time_matrix',
            description: '构建时间矩阵（所有点对之间的旅行时间）',
            metadata: {
                kind: action_interface_1.ActionKind.INTERNAL,
                cost: action_interface_1.ActionCost.MEDIUM,
                side_effect: action_interface_1.ActionSideEffect.CALLS_API,
                preconditions: ['draft.nodes'],
                idempotent: true,
                cacheable: true,
            },
            input_schema: {
                type: 'object',
                properties: {
                    nodes: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'number' },
                                geo: {
                                    type: 'object',
                                    properties: {
                                        lat: { type: 'number' },
                                        lng: { type: 'number' },
                                    },
                                },
                            },
                        },
                    },
                },
                required: ['nodes'],
            },
            output_schema: {
                type: 'object',
                properties: {
                    time_matrix_api: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
                    time_matrix_robust: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
                },
            },
            execute: async (input, state) => {
                try {
                    const n = input.nodes.length;
                    const timeMatrixApi = [];
                    const timeMatrixRobust = [];
                    const userContext = {
                        budgetSensitivity: 'MEDIUM',
                        timeSensitivity: 'MEDIUM',
                        hasLuggage: false,
                        hasElderly: false,
                        isMovingDay: false,
                        isRaining: false,
                        hasLimitedMobility: false,
                    };
                    for (let i = 0; i < n; i++) {
                        const rowApi = [];
                        const rowRobust = [];
                        for (let j = 0; j < n; j++) {
                            if (i === j) {
                                rowApi.push(0);
                                rowRobust.push(0);
                            }
                            else {
                                const from = input.nodes[i];
                                const to = input.nodes[j];
                                try {
                                    const recommendation = await transportRoutingService.planRoute(from.geo.lat, from.geo.lng, to.geo.lat, to.geo.lng, userContext);
                                    const bestOption = recommendation.options[0];
                                    const apiTime = (bestOption === null || bestOption === void 0 ? void 0 : bestOption.durationMinutes) || 30;
                                    const bufferFactor = 1.2;
                                    const fixedBuffer = 15;
                                    const robustTime = Math.round(apiTime * bufferFactor + fixedBuffer);
                                    rowApi.push(apiTime);
                                    rowRobust.push(robustTime);
                                }
                                catch (error) {
                                    const estimatedTime = 30;
                                    rowApi.push(estimatedTime);
                                    rowRobust.push(Math.round(estimatedTime * 1.2 + 15));
                                }
                            }
                        }
                        timeMatrixApi.push(rowApi);
                        timeMatrixRobust.push(rowRobust);
                    }
                    return {
                        time_matrix_api: timeMatrixApi,
                        time_matrix_robust: timeMatrixRobust,
                    };
                }
                catch (error) {
                    throw new Error(`构建时间矩阵失败: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`);
                }
            },
        },
    ];
}
//# sourceMappingURL=transport.actions.js.map