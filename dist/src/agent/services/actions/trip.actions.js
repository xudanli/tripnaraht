"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTripActions = createTripActions;
const action_interface_1 = require("../../interfaces/action.interface");
const luxon_1 = require("luxon");
const common_1 = require("@nestjs/common");
function pickTripId(...candidates) {
    for (const c of candidates) {
        if (c === null || c === undefined) {
            continue;
        }
        const str = String(c).trim();
        if (str.length > 0) {
            return str;
        }
    }
    return undefined;
}
function createTripActions(tripsService, itineraryItemsService) {
    return [
        {
            name: 'trip.load_draft',
            description: '加载行程草稿',
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
                    trip_id: { type: 'string' },
                },
                required: ['trip_id'],
            },
            output_schema: {
                type: 'object',
                properties: {
                    trip: { type: 'object' },
                    items: { type: 'array' },
                },
            },
            execute: async (input, state) => {
                var _a;
                const inputRecord = (input !== null && input !== void 0 ? input : {});
                const stateRecord = (state !== null && state !== void 0 ? state : {});
                const tripRecord = ((_a = stateRecord.trip) !== null && _a !== void 0 ? _a : {});
                const tripId = pickTripId(inputRecord.trip_id, inputRecord.tripId, tripRecord.trip_id, stateRecord.tripId);
                if (!tripId) {
                    const errorMsg = `tripId is required for trip.load_draft. 
Available sources:
- input.trip_id: ${inputRecord.trip_id}
- input.tripId: ${inputRecord.tripId}
- state.trip.trip_id: ${tripRecord.trip_id}
- state.tripId: ${stateRecord.tripId}
Please provide args.trip_id or ensure it is stored in agent state.`;
                    throw new common_1.BadRequestException(errorMsg);
                }
                if (typeof tripId !== 'string' || !tripId.trim()) {
                    throw new common_1.BadRequestException(`Invalid tripId: expected non-empty string, got ${typeof tripId}: ${tripId}`);
                }
                const trip = await tripsService.findOne(tripId.trim());
                const items = [];
                if (trip.days && Array.isArray(trip.days)) {
                    for (const day of trip.days) {
                        if (day.items && Array.isArray(day.items)) {
                            items.push(...day.items);
                        }
                    }
                }
                return {
                    trip,
                    items,
                    tripId,
                };
            },
        },
        {
            name: 'trip.apply_user_edit',
            description: '应用用户编辑（仅当已有完整的编辑信息时使用，包括 placeId、tripDayId、startTime、endTime 等。如果用户只是说"添加地点X"但没有提供完整信息，应该先使用 places.resolve_entities）',
            metadata: {
                kind: action_interface_1.ActionKind.INTERNAL,
                cost: action_interface_1.ActionCost.LOW,
                side_effect: action_interface_1.ActionSideEffect.WRITES_DB,
                preconditions: ['trip.trip_id'],
                idempotent: false,
                cacheable: false,
            },
            input_schema: {
                type: 'object',
                properties: {
                    trip_id: {
                        type: 'string',
                        description: '行程ID（字符串）',
                    },
                    edits: {
                        type: 'array',
                        description: '编辑操作数组，不能为空',
                        items: {
                            type: 'object',
                            properties: {
                                type: {
                                    type: 'string',
                                    enum: ['add', 'update', 'delete', 'move'],
                                    description: '编辑类型',
                                },
                                itemId: {
                                    type: 'string',
                                    description: '行程项ID（update/delete/move时需要）',
                                },
                                placeId: {
                                    type: 'number',
                                    description: '地点ID（add时需要）',
                                },
                                tripDayId: {
                                    type: 'string',
                                    description: '日期ID（add时需要）',
                                },
                                startTime: {
                                    type: 'string',
                                    description: '开始时间（ISO字符串，add/update/move时需要）',
                                },
                                endTime: {
                                    type: 'string',
                                    description: '结束时间（ISO字符串，add/update/move时需要）',
                                },
                                updates: {
                                    type: 'object',
                                    description: '更新数据（update时需要）',
                                },
                                newTripDayId: {
                                    type: 'string',
                                    description: '新日期ID（move时需要）',
                                },
                                newStartTime: {
                                    type: 'string',
                                    description: '新开始时间（move时需要）',
                                },
                                newEndTime: {
                                    type: 'string',
                                    description: '新结束时间（move时需要）',
                                },
                            },
                            required: ['type'],
                        },
                        minItems: 1,
                    },
                },
                required: ['trip_id', 'edits'],
            },
            output_schema: {
                type: 'object',
                properties: {
                    success: { type: 'boolean' },
                },
            },
            execute: async (input, state) => {
                if (!itineraryItemsService) {
                    throw new Error('ItineraryItemsService is required for apply_user_edit action');
                }
                const { trip_id, edits } = input;
                if (!trip_id) {
                    return {
                        success: false,
                        error: 'trip_id is required',
                        results: [],
                        appliedCount: 0,
                        totalCount: 0,
                    };
                }
                if (!edits) {
                    return {
                        success: false,
                        error: 'edits is required and must be an array',
                        results: [],
                        appliedCount: 0,
                        totalCount: 0,
                    };
                }
                let editsArray;
                if (Array.isArray(edits)) {
                    editsArray = edits;
                }
                else if (typeof edits === 'object' && edits !== null) {
                    editsArray = [edits];
                    console.warn(`[trip.apply_user_edit] edits is not an array, converted single object to array`);
                }
                else {
                    return {
                        success: false,
                        error: `edits must be an array or object, got ${typeof edits}`,
                        results: [],
                        appliedCount: 0,
                        totalCount: 0,
                    };
                }
                if (editsArray.length === 0) {
                    return {
                        success: false,
                        error: 'edits array cannot be empty',
                        results: [],
                        appliedCount: 0,
                        totalCount: 0,
                    };
                }
                const results = [];
                for (const edit of editsArray) {
                    try {
                        if (edit.type === 'delete' && edit.itemId) {
                            await itineraryItemsService.remove(edit.itemId);
                            results.push({ type: 'delete', success: true });
                        }
                        else if (edit.type === 'update' && edit.itemId && edit.updates) {
                            await itineraryItemsService.update(edit.itemId, edit.updates);
                            results.push({ type: 'update', success: true });
                        }
                        else if (edit.type === 'move' && edit.itemId) {
                            const updateData = {};
                            if (edit.newTripDayId) {
                                updateData.tripDayId = edit.newTripDayId;
                            }
                            if (edit.newStartTime) {
                                updateData.startTime = edit.newStartTime;
                            }
                            if (edit.newEndTime) {
                                updateData.endTime = edit.newEndTime;
                            }
                            if (Object.keys(updateData).length > 0) {
                                await itineraryItemsService.update(edit.itemId, updateData);
                                results.push({ type: 'move', success: true });
                            }
                            else {
                                results.push({ type: 'move', success: false, error: 'No update data provided' });
                            }
                        }
                        else {
                            results.push({ type: edit.type || 'unknown', success: false, error: 'Invalid edit format' });
                        }
                    }
                    catch (error) {
                        results.push({
                            type: edit.type || 'unknown',
                            success: false,
                            error: (error === null || error === void 0 ? void 0 : error.message) || String(error)
                        });
                    }
                }
                const allSuccess = results.every(r => r.success);
                return {
                    success: allSuccess,
                    results,
                    appliedCount: results.filter(r => r.success).length,
                    totalCount: results.length
                };
            },
        },
        {
            name: 'trip.persist_plan',
            description: '持久化规划结果',
            metadata: {
                kind: action_interface_1.ActionKind.EXTERNAL,
                cost: action_interface_1.ActionCost.MEDIUM,
                side_effect: action_interface_1.ActionSideEffect.WRITES_DB,
                preconditions: ['result.timeline'],
                idempotent: false,
                cacheable: false,
            },
            input_schema: {
                type: 'object',
                properties: {
                    trip_id: { type: 'string' },
                    timeline: { type: 'array' },
                },
                required: ['trip_id', 'timeline'],
            },
            output_schema: {
                type: 'object',
                properties: {
                    success: { type: 'boolean' },
                },
            },
            execute: async (input, state) => {
                var _a;
                const { trip_id, timeline } = input;
                if (!timeline || timeline.length === 0) {
                    return { success: false, error: 'Timeline is empty' };
                }
                try {
                    const trip = await tripsService.findOne(trip_id);
                    const results = [];
                    for (let i = 0; i < timeline.length && i < (((_a = trip.days) === null || _a === void 0 ? void 0 : _a.length) || 0); i++) {
                        const timelineItem = timeline[i];
                        const day = trip.days[i];
                        let schedule;
                        let dateISO;
                        if (timelineItem.schedule) {
                            schedule = timelineItem.schedule;
                            dateISO = timelineItem.date || luxon_1.DateTime.fromJSDate(day.date).toISODate() || '';
                        }
                        else if (timelineItem.stops) {
                            schedule = timelineItem;
                            dateISO = luxon_1.DateTime.fromJSDate(day.date).toISODate() || '';
                        }
                        else {
                            const dayDateISO = luxon_1.DateTime.fromJSDate(day.date).toISODate() || 'unknown';
                            results.push({
                                date: dayDateISO,
                                success: false,
                                error: 'Invalid timeline item format'
                            });
                            continue;
                        }
                        if (!dateISO) {
                            results.push({
                                date: 'unknown',
                                success: false,
                                error: 'Could not determine date'
                            });
                            continue;
                        }
                        try {
                            await tripsService.saveSchedule(trip_id, dateISO, schedule);
                            results.push({ date: dateISO, success: true });
                        }
                        catch (error) {
                            results.push({
                                date: dateISO,
                                success: false,
                                error: (error === null || error === void 0 ? void 0 : error.message) || String(error)
                            });
                        }
                    }
                    const allSuccess = results.every(r => r.success);
                    return {
                        success: allSuccess,
                        results,
                        savedCount: results.filter(r => r.success).length,
                        totalCount: results.length
                    };
                }
                catch (error) {
                    return {
                        success: false,
                        error: (error === null || error === void 0 ? void 0 : error.message) || String(error)
                    };
                }
            },
        },
    ];
}
//# sourceMappingURL=trip.actions.js.map