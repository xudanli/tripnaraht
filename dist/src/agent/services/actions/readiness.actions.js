"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReadinessActions = createReadinessActions;
const action_interface_1 = require("../../interfaces/action.interface");
function createReadinessActions(readinessService) {
    return [
        {
            name: 'readiness.check',
            description: '检查旅行准备度（基于目的地、行程信息和地理特征）',
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
                    destination_id: { type: 'string' },
                    traveler: {
                        type: 'object',
                        properties: {
                            nationality: { type: 'string' },
                            residency_country: { type: 'string' },
                            tags: { type: 'array', items: { type: 'string' } },
                            budget_level: { type: 'string', enum: ['low', 'medium', 'high'] },
                            risk_tolerance: { type: 'string', enum: ['low', 'medium', 'high'] },
                        },
                    },
                    trip: {
                        type: 'object',
                        properties: {
                            start_date: { type: 'string' },
                            end_date: { type: 'string' },
                        },
                    },
                    itinerary: {
                        type: 'object',
                        properties: {
                            countries: { type: 'array', items: { type: 'string' } },
                            activities: { type: 'array', items: { type: 'string' } },
                            season: { type: 'string' },
                        },
                    },
                    geo: {
                        type: 'object',
                        properties: {
                            lat: { type: 'number' },
                            lng: { type: 'number' },
                            enhance_with_geo: { type: 'boolean' },
                        },
                    },
                },
                required: ['destination_id'],
            },
            output_schema: {
                type: 'object',
                properties: {
                    findings: { type: 'array' },
                    summary: {
                        type: 'object',
                        properties: {
                            total_blockers: { type: 'number' },
                            total_must: { type: 'number' },
                            total_should: { type: 'number' },
                            total_optional: { type: 'number' },
                            total_risks: { type: 'number' },
                        },
                    },
                    constraints: { type: 'array' },
                    tasks: { type: 'array' },
                },
            },
            execute: async (input, state) => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
                const context = {
                    traveler: input.traveler || {},
                    trip: ((_a = input.trip) === null || _a === void 0 ? void 0 : _a.start_date) || ((_b = input.trip) === null || _b === void 0 ? void 0 : _b.end_date) ? {
                        startDate: input.trip.start_date,
                        endDate: input.trip.end_date,
                    } : {},
                    itinerary: {
                        countries: ((_c = input.itinerary) === null || _c === void 0 ? void 0 : _c.countries) || [],
                        activities: ((_d = input.itinerary) === null || _d === void 0 ? void 0 : _d.activities) || [],
                        season: (_e = input.itinerary) === null || _e === void 0 ? void 0 : _e.season,
                    },
                    geo: ((_f = input.geo) === null || _f === void 0 ? void 0 : _f.lat) && ((_g = input.geo) === null || _g === void 0 ? void 0 : _g.lng) ? {
                        latitude: input.geo.lat,
                    } : undefined,
                };
                const result = await readinessService.checkFromDestination(input.destination_id, context, {
                    enhanceWithGeo: (_j = (_h = input.geo) === null || _h === void 0 ? void 0 : _h.enhance_with_geo) !== null && _j !== void 0 ? _j : true,
                    geoLat: (_k = input.geo) === null || _k === void 0 ? void 0 : _k.lat,
                    geoLng: (_l = input.geo) === null || _l === void 0 ? void 0 : _l.lng,
                });
                const constraints = await readinessService.getConstraints(result);
                const tasks = await readinessService.getTasks(result);
                return {
                    findings: result.findings,
                    summary: result.summary,
                    constraints,
                    tasks,
                };
            },
        },
    ];
}
//# sourceMappingURL=readiness.actions.js.map