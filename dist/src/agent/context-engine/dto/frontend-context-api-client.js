"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.examples = void 0;
exports.getContextMetrics = getContextMetrics;
exports.getContextPackages = getContextPackages;
exports.getContextPackageDetail = getContextPackageDetail;
exports.getContextAnalytics = getContextAnalytics;
const API_BASE_URL = '/api/context';
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
async function getContextMetrics(params) {
    const queryString = new URLSearchParams(Object.entries(params || {}).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== null) {
            acc[key] = String(value);
        }
        return acc;
    }, {})).toString();
    return request(`/admin/metrics?${queryString}`, {
        method: 'GET',
    });
}
async function getContextPackages(params) {
    const queryString = new URLSearchParams(Object.entries(params || {}).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== null) {
            acc[key] = String(value);
        }
        return acc;
    }, {})).toString();
    return request(`/admin/packages?${queryString}`, {
        method: 'GET',
    });
}
async function getContextPackageDetail(id) {
    return request(`/admin/packages/${id}`, {
        method: 'GET',
    });
}
async function getContextAnalytics(params) {
    const queryString = new URLSearchParams(Object.entries(params || {}).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== null) {
            acc[key] = String(value);
        }
        return acc;
    }, {})).toString();
    return request(`/admin/analytics?${queryString}`, {
        method: 'GET',
    });
}
exports.examples = {
    async getMetricsExample() {
        var _a;
        try {
            const response = await getContextMetrics({
                startTime: '2025-01-01T00:00:00Z',
                endTime: '2025-01-31T23:59:59Z',
                agent: 'PLANNER',
            });
            if (response.success && response.data) {
                const { summary, byAgent, byPhase } = response.data;
                console.log('总记录数:', summary.totalRecords);
                console.log('平均 Token:', summary.avgTokens);
                console.log('缓存命中率:', summary.cacheHitRate);
                console.log('按 Agent 统计:', byAgent);
                console.log('按 Phase 统计:', byPhase);
                return { summary, byAgent, byPhase };
            }
            else {
                throw new Error(((_a = response.error) === null || _a === void 0 ? void 0 : _a.message) || 'Unknown error');
            }
        }
        catch (error) {
            console.error('获取指标统计失败:', error);
            throw error;
        }
    },
    async getPackagesExample() {
        var _a;
        try {
            const response = await getContextPackages({
                page: 1,
                limit: 20,
                phase: 'planning',
                agent: 'PLANNER',
                search: '冰岛',
            });
            if (response.success && response.data) {
                const { packages, total, totalPages } = response.data;
                console.log(`共 ${total} 个 Context Package，第 1 页，共 ${totalPages} 页`);
                console.log('Packages:', packages);
                return { packages, total, totalPages };
            }
            else {
                throw new Error(((_a = response.error) === null || _a === void 0 ? void 0 : _a.message) || 'Unknown error');
            }
        }
        catch (error) {
            console.error('获取 Context Package 列表失败:', error);
            throw error;
        }
    },
    async getAnalyticsExample() {
        var _a;
        try {
            const response = await getContextAnalytics({
                startTime: '2025-01-01T00:00:00Z',
                endTime: '2025-01-31T23:59:59Z',
                granularity: 'day',
            });
            if (response.success && response.data) {
                const { tokenUsageTrend, cacheHitRateTrend, compressionAnalysis, qualityAnalysis, topBlockTypes, performanceBottlenecks, } = response.data;
                console.log('Token 使用趋势:', tokenUsageTrend);
                console.log('缓存命中率趋势:', cacheHitRateTrend);
                console.log('压缩率分析:', compressionAnalysis);
                console.log('质量分布:', qualityAnalysis.distribution);
                console.log('Top Block Types:', topBlockTypes);
                console.log('性能瓶颈:', performanceBottlenecks);
                return response.data;
            }
            else {
                throw new Error(((_a = response.error) === null || _a === void 0 ? void 0 : _a.message) || 'Unknown error');
            }
        }
        catch (error) {
            console.error('获取分析报告失败:', error);
            throw error;
        }
    },
};
//# sourceMappingURL=frontend-context-api-client.js.map