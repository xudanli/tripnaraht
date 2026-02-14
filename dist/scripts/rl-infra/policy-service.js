"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const policy_service_types_1 = require("./policy-service-types");
class PolicyServiceState {
    constructor() {
        this.current_model_version = 'v1.0.0';
        this.fallback_model_version = 'v0.9.0';
        this.total_requests = 0;
        this.success_count = 0;
        this.error_count = 0;
        this.latencies = [];
        this.start_time = Date.now();
        this.model_loaded = true;
    }
}
const state = new PolicyServiceState();
function percentile(data, p) {
    if (!data || data.length === 0) {
        return 0;
    }
    const sorted = [...data].sort((a, b) => a - b);
    const k = ((sorted.length - 1) * p) / 100;
    const f = Math.floor(k);
    const c = f + 1;
    if (c >= sorted.length) {
        return sorted[sorted.length - 1];
    }
    return sorted[f] * (c - k) + sorted[c] * (k - f);
}
function calculateQPS() {
    const elapsed_time = (Date.now() - state.start_time) / 1000;
    return elapsed_time > 0 ? state.total_requests / elapsed_time : 0;
}
function calculateErrorRate() {
    return state.total_requests > 0
        ? state.error_count / state.total_requests
        : 0;
}
async function runPolicyInference(request) {
    const start_time = Date.now();
    try {
        await new Promise((resolve) => setTimeout(resolve, 10));
        let action = policy_service_types_1.PolicyAction.ALLOW;
        let confidence = 0.95;
        let reasoning = 'Plan appears safe and feasible';
        if (request.state.destination &&
            String(request.state.destination)
                .toUpperCase()
                .includes('HIGH_RISK')) {
            action = policy_service_types_1.PolicyAction.REJECT;
            confidence = 0.99;
            reasoning = 'Destination flagged as high risk';
        }
        else if (request.state.constraints) {
            const budget = request.state.constraints.budget;
            if (budget !== undefined && budget < 100) {
                action = policy_service_types_1.PolicyAction.CLARIFY;
                confidence = 0.8;
                reasoning = 'Budget may be insufficient';
            }
        }
        const latency_ms = Date.now() - start_time;
        const model_version = request.model_version || state.current_model_version;
        state.total_requests++;
        state.success_count++;
        state.latencies.push(latency_ms);
        if (state.latencies.length > 1000) {
            state.latencies.shift();
        }
        return {
            request_id: request.request_id,
            action,
            confidence,
            reasoning,
            model_version,
            latency_ms,
            timestamp: new Date().toISOString(),
        };
    }
    catch (error) {
        state.total_requests++;
        state.error_count++;
        console.error(`[Policy] Error: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
        throw error;
    }
}
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((req, res, next) => {
    console.log(`[PolicyService] ${req.method} ${req.path}`);
    next();
});
app.use((err, req, res, next) => {
    console.error(`[PolicyService] Error: ${err.message}`, err.stack);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message,
    });
});
app.get('/health', (req, res) => {
    const latencies = state.latencies.length > 0 ? state.latencies : [0];
    const sorted_latencies = [...latencies].sort((a, b) => a - b);
    const p95_latency_ms = percentile(sorted_latencies, 95);
    const health = {
        status: state.model_loaded ? 'healthy' : 'unhealthy',
        service: 'policy',
        model_loaded: state.model_loaded,
        current_model_version: state.current_model_version,
        fallback_model_version: state.fallback_model_version,
        qps: calculateQPS(),
        p95_latency_ms,
        error_rate: calculateErrorRate(),
        uptime_seconds: Math.floor((Date.now() - state.start_time) / 1000),
    };
    res.json(health);
});
app.post('/predict', async (req, res, next) => {
    try {
        const request = req.body;
        if (!request.request_id || !request.state) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'request_id and state are required',
            });
        }
        const response = await runPolicyInference(request);
        res.json(response);
    }
    catch (error) {
        next(error);
    }
});
app.post('/batch-predict', async (req, res, next) => {
    try {
        const batchRequest = req.body;
        if (!batchRequest.requests || !Array.isArray(batchRequest.requests)) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'requests array is required',
            });
        }
        const start_time = Date.now();
        const responses = [];
        for (const request of batchRequest.requests) {
            const response = await runPolicyInference(request);
            responses.push(response);
        }
        const total_latency_ms = Date.now() - start_time;
        const batchResponse = {
            responses,
            total_latency_ms,
        };
        res.json(batchResponse);
    }
    catch (error) {
        next(error);
    }
});
app.get('/metrics', (req, res) => {
    const latencies = state.latencies.length > 0 ? state.latencies : [0];
    const sorted_latencies = [...latencies].sort((a, b) => a - b);
    const metrics = {
        total_requests: state.total_requests,
        success_count: state.success_count,
        error_count: state.error_count,
        avg_latency_ms: latencies.reduce((sum, val) => sum + val, 0) / latencies.length,
        p50_latency_ms: percentile(sorted_latencies, 50),
        p95_latency_ms: percentile(sorted_latencies, 95),
        p99_latency_ms: percentile(sorted_latencies, 99),
        qps: calculateQPS(),
        model_version: state.current_model_version,
    };
    res.json(metrics);
});
app.post('/deploy', (req, res) => {
    try {
        const deployRequest = req.body;
        if (!deployRequest.model_version) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'model_version is required',
            });
        }
        const old_version = state.current_model_version;
        state.current_model_version = deployRequest.model_version;
        state.model_loaded = true;
        console.log(`[PolicyService] Deploy: ${old_version} -> ${deployRequest.model_version}`);
        const deployResponse = {
            status: 'deployed',
            old_version,
            new_version: deployRequest.model_version,
            deployed_at: new Date().toISOString(),
        };
        res.json(deployResponse);
    }
    catch (error) {
        res.status(500).json({
            error: 'Deployment failed',
            message: error === null || error === void 0 ? void 0 : error.message,
        });
    }
});
app.post('/rollback', (req, res) => {
    try {
        const old_version = state.current_model_version;
        state.current_model_version = state.fallback_model_version;
        state.model_loaded = true;
        console.log(`[PolicyService] Rollback: ${old_version} -> ${state.fallback_model_version}`);
        const rollbackResponse = {
            status: 'rolled_back',
            old_version,
            new_version: state.fallback_model_version,
            deployed_at: new Date().toISOString(),
        };
        res.json(rollbackResponse);
    }
    catch (error) {
        res.status(500).json({
            error: 'Rollback failed',
            message: error === null || error === void 0 ? void 0 : error.message,
        });
    }
});
const PORT = parseInt(process.env.POLICY_SERVICE_PORT || '8002', 10);
const HOST = process.env.POLICY_SERVICE_HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
    console.log(`=================================`);
    console.log(`🚀 PolicyService started`);
    console.log(`📍 Listening on http://${HOST}:${PORT}`);
    console.log(`📋 API endpoints:`);
    console.log(`   POST   /predict`);
    console.log(`   POST   /batch-predict`);
    console.log(`   GET    /health`);
    console.log(`   GET    /metrics`);
    console.log(`   POST   /deploy`);
    console.log(`   POST   /rollback`);
    console.log(`=================================`);
});
process.on('SIGTERM', () => {
    console.log('[PolicyService] SIGTERM received, shutting down gracefully');
    process.exit(0);
});
process.on('SIGINT', () => {
    console.log('[PolicyService] SIGINT received, shutting down gracefully');
    process.exit(0);
});
//# sourceMappingURL=policy-service.js.map