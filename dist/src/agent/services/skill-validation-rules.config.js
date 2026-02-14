"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SKILL_VALIDATION_RULES = void 0;
exports.SKILL_VALIDATION_RULES = {
    'decision.runThreeGuardians': {
        dependencies: [
            { param: 'world', alternatives: ['tripId'] },
            { param: 'tripId', alternatives: ['world'] },
        ],
        extractors: {
            tripId: (context, request) => context.tripId || request.trip_id,
        },
    },
    'world.buildContext': {
        dependencies: [
            { param: 'countryCode', alternatives: ['tripId'] },
            { param: 'tripId', alternatives: ['countryCode'] },
        ],
        extractors: {
            tripId: (context, request) => context.tripId || request.trip_id,
            countryCode: (context, request) => {
                return undefined;
            },
        },
    },
    'routeDirection.pickForIntent': {
        dependencies: [
            { param: 'countryCode' },
        ],
        extractors: {
            countryCode: (context, request) => {
                return undefined;
            },
        },
    },
    'itinerary.generate': {
        dependencies: [
            { param: 'request' },
        ],
    },
    'itinerary.verify': {
        dependencies: [
            { param: 'itinerary' },
        ],
    },
    'transport.search': {
        dependencies: [
            { param: 'origin' },
            { param: 'destination' },
        ],
    },
    'poi.search': {
        dependencies: [
            { param: 'query' },
        ],
    },
    'readiness.generateChecklist': {
        dependencies: [
            { param: 'world', alternatives: ['tripId'] },
            { param: 'tripId', alternatives: ['world'] },
        ],
        extractors: {
            tripId: (context, request) => context.tripId || request.trip_id,
        },
    },
    'opening_hours.get': {
        dependencies: [
            { param: 'poi_ids' },
        ],
    },
    'repair.apply': {
        dependencies: [
            { param: 'itinerary' },
            { param: 'adjustments' },
        ],
    },
    'plan.gate.runThreeGuardians': {
        dependencies: [
            { param: 'planState' },
        ],
        extractors: {
            tripId: (context, request) => context.tripId || request.trip_id,
        },
    },
    'plan.gate.precheck': {
        dependencies: [
            { param: 'planState' },
        ],
    },
    'plan.architect.generateSkeleton': {
        dependencies: [
            { param: 'context' },
        ],
        extractors: {
            tripId: (context, request) => context.tripId || request.trip_id,
        },
    },
    'plan.budget.estimateBaseline': {
        dependencies: [
            { param: 'planState' },
            { param: 'destination' },
        ],
    },
    'plan.budget.detectOverrun': {
        dependencies: [
            { param: 'planState' },
        ],
    },
    'plan.budget.proposeTradeoffs': {
        dependencies: [
            { param: 'planState' },
            { param: 'targetSavings' },
        ],
    },
    'geo.findNearbyPOI': {
        dependencies: [
            { param: 'location' },
            { param: 'radius' },
        ],
    },
    'readiness.summarizeRisks': {
        dependencies: [
            { param: 'world', alternatives: ['tripId'] },
            { param: 'tripId', alternatives: ['world'] },
        ],
        extractors: {
            tripId: (context, request) => context.tripId || request.trip_id,
        },
    },
    'plan.pace.computeTimeWindows': {
        dependencies: [
            { param: 'planState' },
        ],
    },
    'plan.gate.proposeSafeAlternatives': {
        dependencies: [
            { param: 'planState' },
            { param: 'issue' },
        ],
    },
    'dem.getProfile': {
        dependencies: [
            { param: 'polyline' },
        ],
    },
    'routeDirection.listForCountry': {
        dependencies: [
            { param: 'countryCode' },
        ],
        extractors: {
            countryCode: (context, request) => {
                return undefined;
            },
        },
    },
};
//# sourceMappingURL=skill-validation-rules.config.js.map