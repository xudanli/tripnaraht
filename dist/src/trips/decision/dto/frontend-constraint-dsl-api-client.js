"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectConflicts = detectConflicts;
exports.checkConstraintsWithExplanation = checkConstraintsWithExplanation;
exports.generateMultiplePlans = generateMultiplePlans;
const API_BASE_URL = '/decision';
async function request(endpoint, options = {}) {
    var _a;
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
        ...options,
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(((_a = errorData.error) === null || _a === void 0 ? void 0 : _a.message) || `HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (typeof data === 'object' && data !== null && 'success' in data) {
        return data;
    }
    return { success: true, data };
}
async function detectConflicts(constraints, plan, state) {
    return request('/detect-conflicts', {
        method: 'POST',
        body: JSON.stringify({
            constraints,
            plan,
            state,
        }),
    });
}
async function checkConstraintsWithExplanation(state, plan) {
    return request('/check-constraints-with-explanation', {
        method: 'POST',
        body: JSON.stringify({
            state,
            plan,
        }),
    });
}
async function generateMultiplePlans(state, constraints) {
    return request('/generate-multiple-plans', {
        method: 'POST',
        body: JSON.stringify({
            state,
            constraints,
        }),
    });
}
//# sourceMappingURL=frontend-constraint-dsl-api-client.js.map