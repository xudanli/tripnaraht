"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.examples = void 0;
exports.buildContextPackage = buildContextPackage;
exports.compressContext = compressContext;
exports.projectState = projectState;
exports.writeBack = writeBack;
exports.getMetrics = getMetrics;
const API_BASE_URL = '/context';
async function request(endpoint, options = {}) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
        ...options,
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (typeof data === 'object' && data !== null && 'success' in data) {
        return data;
    }
    return { success: true, data };
}
async function buildContextPackage(params) {
    return request('/build', {
        method: 'POST',
        body: JSON.stringify(params),
    });
}
async function compressContext(params) {
    return request('/compress', {
        method: 'POST',
        body: JSON.stringify(params),
    });
}
async function projectState(params) {
    return request('/project-state', {
        method: 'POST',
        body: JSON.stringify(params),
    });
}
async function writeBack(params) {
    return request('/write-back', {
        method: 'POST',
        body: JSON.stringify(params),
    });
}
async function getMetrics(query = {}) {
    const queryString = new URLSearchParams(Object.entries(query).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== null) {
            acc[key] = String(value);
        }
        return acc;
    }, {})).toString();
    return request(`/metrics?${queryString}`, {
        method: 'GET',
    });
}
exports.examples = {
    async buildContextExample() {
        var _a;
        try {
            const response = await buildContextPackage({
                tripId: 'trip-123',
                phase: 'planning',
                agent: 'PLANNER',
                userQuery: '帮我规划冰岛7天行程',
                tokenBudget: 3600,
                requiredTopics: ['VISA', 'ROAD_RULES', 'SAFETY'],
            });
            if (response.success && response.data) {
                const { contextPackage } = response.data;
                console.log('Context Package ID:', contextPackage.id);
                console.log('Total Tokens:', contextPackage.totalTokens);
                console.log('Blocks:', contextPackage.blocks.length);
                if (contextPackage.totalTokens > contextPackage.tokenBudget) {
                    const compressResponse = await compressContext({
                        blocks: contextPackage.blocks,
                        tokenBudget: contextPackage.tokenBudget,
                        strategy: 'balanced',
                    });
                    if (compressResponse.success && compressResponse.data) {
                        console.log('压缩后 Tokens:', compressResponse.data.stats.compressedTokens);
                        return compressResponse.data.compressedBlocks;
                    }
                }
                return contextPackage.blocks;
            }
            else {
                throw new Error(((_a = response.error) === null || _a === void 0 ? void 0 : _a.message) || 'Unknown error');
            }
        }
        catch (error) {
            console.error('构建 Context Package 失败:', error);
            throw error;
        }
    },
    async getMetricsExample(tripId) {
        var _a;
        try {
            const response = await getMetrics({
                tripId,
                phase: 'planning',
                limit: 10,
            });
            if (response.success && response.data) {
                const { summary, recent } = response.data;
                console.log('平均 Token 使用:', summary.avgTokens);
                console.log('缓存命中率:', summary.cacheHitRate);
                console.log('质量分布:', summary.qualityDistribution);
                console.log('最近的记录:', recent);
                return { summary, recent };
            }
            else {
                throw new Error(((_a = response.error) === null || _a === void 0 ? void 0 : _a.message) || 'Unknown error');
            }
        }
        catch (error) {
            console.error('获取指标失败:', error);
            throw error;
        }
    },
};
//# sourceMappingURL=context-api-client.js.map