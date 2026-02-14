"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var AgentStateService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentStateService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
let AgentStateService = AgentStateService_1 = class AgentStateService {
    constructor() {
        this.logger = new common_1.Logger(AgentStateService_1.name);
        this.states = new Map();
    }
    createInitialState(userInput, userId, tripId, options) {
        const requestId = (0, crypto_1.randomUUID)();
        const state = {
            request_id: requestId,
            user_input: userInput,
            trip: {
                trip_id: tripId || null,
                days: 1,
                day_boundaries: [{ start: '10:00', end: '22:00' }],
                lunch_break: {
                    enabled: true,
                    duration_min: 60,
                    window: ['11:30', '13:30'],
                },
                pacing: 'normal',
            },
            draft: {
                nodes: [],
                hard_nodes: [],
                soft_nodes: [],
                edits: [],
            },
            memory: {
                semantic_facts: {
                    pois: [],
                    rules: {},
                },
                episodic_snippets: [],
                user_profile: {},
            },
            compute: {
                clusters: null,
                time_matrix_api: null,
                time_matrix_robust: null,
                optimization_results: [],
                robustness: null,
            },
            react: {
                step: 0,
                max_steps: (options === null || options === void 0 ? void 0 : options.max_steps) || 8,
                observations: [],
                decision_log: [],
            },
            result: {
                status: 'DRAFT',
                timeline: [],
                dropped_items: [],
                explanations: [],
            },
            observability: {
                router_ms: 0,
                latency_ms: 0,
                tool_calls: 0,
                browser_steps: 0,
                cost_est_usd: 0.0,
                fallback_used: false,
            },
            llm_provider: (options === null || options === void 0 ? void 0 : options.llm_provider) || 'auto',
        };
        this.states.set(requestId, state);
        this.logger.debug(`Created initial state for request: ${requestId}`);
        return state;
    }
    get(requestId) {
        return this.states.get(requestId);
    }
    update(requestId, updates) {
        const state = this.states.get(requestId);
        if (!state) {
            throw new Error(`State not found for request: ${requestId}`);
        }
        const updated = { ...state, ...updates };
        this.states.set(requestId, updated);
        return updated;
    }
    updateNested(requestId, path, value) {
        const state = this.states.get(requestId);
        if (!state) {
            throw new Error(`State not found for request: ${requestId}`);
        }
        const updated = { ...state };
        let current = updated;
        for (let i = 0; i < path.length - 1; i++) {
            current = current[path[i]] = { ...current[path[i]] };
        }
        current[path[path.length - 1]] = value;
        this.states.set(requestId, updated);
        return updated;
    }
    delete(requestId) {
        this.states.delete(requestId);
    }
    cleanup(maxAge = 3600000) {
    }
};
exports.AgentStateService = AgentStateService;
exports.AgentStateService = AgentStateService = AgentStateService_1 = __decorate([
    (0, common_1.Injectable)()
], AgentStateService);
//# sourceMappingURL=agent-state.service.js.map