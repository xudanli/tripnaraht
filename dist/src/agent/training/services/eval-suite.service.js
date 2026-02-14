"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var EvalSuiteService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvalSuiteService = void 0;
const common_1 = require("@nestjs/common");
const policy_service_manager_service_1 = require("./policy-service-manager.service");
let EvalSuiteService = EvalSuiteService_1 = class EvalSuiteService {
    constructor(policyService) {
        this.policyService = policyService;
        this.logger = new common_1.Logger(EvalSuiteService_1.name);
        this.testCases = new Map();
        this.initializeTestCases();
    }
    async evaluateRouter(modelVersion, testCases) {
        this.logger.log(`[EvalSuite] 开始Router评测: modelVersion=${modelVersion}`);
        const tests = testCases || (await this.getRouterTestCases());
        const results = [];
        const latencies = [];
        for (const testCase of tests) {
            try {
                const startTime = Date.now();
                const response = await this.policyService.predict({
                    request_id: `eval_${testCase.id}`,
                    state: testCase.input,
                    model_version: modelVersion,
                });
                const latency = Date.now() - startTime;
                latencies.push(latency);
                const passed = this.evaluateRouterResult(testCase, response);
                const metrics = this.calculateRouterMetrics(testCase, response);
                results.push({
                    test_case_id: testCase.id,
                    passed,
                    actual_output: {
                        action: response.action,
                        confidence: response.confidence,
                        reasoning: response.reasoning,
                    },
                    expected_output: testCase.expected_output,
                    metrics,
                    latency_ms: latency,
                });
            }
            catch (error) {
                results.push({
                    test_case_id: testCase.id,
                    passed: false,
                    actual_output: {},
                    expected_output: testCase.expected_output,
                    metrics: {},
                    error: error === null || error === void 0 ? void 0 : error.message,
                    latency_ms: 0,
                });
            }
        }
        const passedTests = results.filter((r) => r.passed).length;
        const accuracy = passedTests / results.length;
        const coverage = results.filter((r) => !r.error).length / results.length;
        const errorRate = results.filter((r) => r.error).length / results.length;
        const sortedLatencies = latencies.sort((a, b) => a - b);
        const p50 = this.percentile(sortedLatencies, 50);
        const p95 = this.percentile(sortedLatencies, 95);
        const p99 = this.percentile(sortedLatencies, 99);
        const result = {
            accuracy,
            coverage,
            latency_p50: p50,
            latency_p95: p95,
            latency_p99: p99,
            error_rate: errorRate,
            total_tests: tests.length,
            passed_tests: passedTests,
            failed_tests: tests.length - passedTests,
            detailed_results: results,
        };
        this.logger.log(`[EvalSuite] Router评测完成: accuracy=${accuracy.toFixed(2)}, coverage=${coverage.toFixed(2)}`);
        return result;
    }
    async evaluateGate(modelVersion, testCases) {
        var _a;
        this.logger.log(`[EvalSuite] 开始Gate评测: modelVersion=${modelVersion}`);
        const tests = testCases || (await this.getGateTestCases());
        const results = [];
        const latencies = [];
        let truePositives = 0;
        let falsePositives = 0;
        let falseNegatives = 0;
        let trueNegatives = 0;
        for (const testCase of tests) {
            try {
                const startTime = Date.now();
                const response = await this.policyService.predict({
                    request_id: `eval_${testCase.id}`,
                    state: testCase.input,
                    model_version: modelVersion,
                });
                const latency = Date.now() - startTime;
                latencies.push(latency);
                const riskLevel = ((_a = testCase.metadata) === null || _a === void 0 ? void 0 : _a.risk_level) || 'LOW';
                const expectedAction = riskLevel === 'HIGH' || riskLevel === 'CRITICAL' ? 'REJECT' : 'ALLOW';
                const actualAction = response.action;
                const passed = actualAction === expectedAction;
                if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') {
                    if (actualAction === 'REJECT') {
                        truePositives++;
                    }
                    else {
                        falseNegatives++;
                    }
                }
                else {
                    if (actualAction === 'ALLOW') {
                        trueNegatives++;
                    }
                    else {
                        falsePositives++;
                    }
                }
                results.push({
                    test_case_id: testCase.id,
                    passed,
                    actual_output: {
                        action: actualAction,
                        confidence: response.confidence,
                    },
                    expected_output: {
                        action: expectedAction,
                    },
                    metrics: {
                        risk_level: riskLevel === 'HIGH' || riskLevel === 'CRITICAL' ? 1 : 0,
                        blocked: actualAction === 'REJECT' ? 1 : 0,
                    },
                    latency_ms: latency,
                });
            }
            catch (error) {
                results.push({
                    test_case_id: testCase.id,
                    passed: false,
                    actual_output: {},
                    expected_output: testCase.expected_output,
                    metrics: {},
                    error: error === null || error === void 0 ? void 0 : error.message,
                    latency_ms: 0,
                });
            }
        }
        const precision = truePositives / (truePositives + falsePositives) || 0;
        const recall = truePositives / (truePositives + falseNegatives) || 0;
        const falsePositiveRate = falsePositives / (falsePositives + trueNegatives) || 0;
        const falseNegativeRate = falseNegatives / (truePositives + falseNegatives) || 0;
        const accuracy = (truePositives + trueNegatives) / tests.length;
        const p50 = this.percentile(latencies.sort((a, b) => a - b), 50);
        const p95 = this.percentile(latencies.sort((a, b) => a - b), 95);
        const result = {
            precision,
            recall,
            false_positive_rate: falsePositiveRate,
            false_negative_rate: falseNegativeRate,
            accuracy,
            latency_p50: p50,
            latency_p95: p95,
            total_tests: tests.length,
            passed_tests: results.filter((r) => r.passed).length,
            failed_tests: results.filter((r) => !r.passed).length,
            detailed_results: results,
        };
        this.logger.log(`[EvalSuite] Gate评测完成: precision=${precision.toFixed(2)}, recall=${recall.toFixed(2)}`);
        return result;
    }
    async evaluateItinerary(modelVersion, testCases) {
        this.logger.log(`[EvalSuite] 开始Itinerary评测: modelVersion=${modelVersion}`);
        const tests = testCases || (await this.getItineraryTestCases());
        const results = [];
        const latencies = [];
        const planLengths = [];
        const complexities = [];
        for (const testCase of tests) {
            try {
                const startTime = Date.now();
                const response = await this.policyService.predict({
                    request_id: `eval_${testCase.id}`,
                    state: testCase.input,
                    model_version: modelVersion,
                });
                const latency = Date.now() - startTime;
                latencies.push(latency);
                const success = response.action !== 'REJECT';
                const planLength = this.extractPlanLength(response);
                const complexity = this.calculateComplexity(testCase, response);
                const executability = this.calculateExecutability(response);
                if (planLength > 0) {
                    planLengths.push(planLength);
                }
                complexities.push(complexity);
                results.push({
                    test_case_id: testCase.id,
                    passed: success,
                    actual_output: {
                        action: response.action,
                        plan_length: planLength,
                        complexity,
                        executability,
                    },
                    expected_output: testCase.expected_output,
                    metrics: {
                        plan_length: planLength,
                        complexity,
                        executability,
                    },
                    latency_ms: latency,
                });
            }
            catch (error) {
                results.push({
                    test_case_id: testCase.id,
                    passed: false,
                    actual_output: {},
                    expected_output: testCase.expected_output,
                    metrics: {},
                    error: error === null || error === void 0 ? void 0 : error.message,
                    latency_ms: 0,
                });
            }
        }
        const successRate = results.filter((r) => r.passed).length / results.length;
        const avgPlanLength = planLengths.length > 0
            ? planLengths.reduce((a, b) => a + b, 0) / planLengths.length
            : 0;
        const avgComplexity = complexities.length > 0
            ? complexities.reduce((a, b) => a + b, 0) / complexities.length
            : 0;
        const avgExecutability = results
            .filter((r) => r.metrics.executability !== undefined)
            .reduce((sum, r) => sum + (r.metrics.executability || 0), 0) /
            results.filter((r) => r.metrics.executability !== undefined).length || 0;
        const avgLatency = latencies.length > 0
            ? latencies.reduce((a, b) => a + b, 0) / latencies.length
            : 0;
        const result = {
            success_rate: successRate,
            avg_plan_length: avgPlanLength,
            avg_complexity: avgComplexity,
            executability_score: avgExecutability,
            user_satisfaction: this.calculateUserSatisfaction(results),
            avg_latency_ms: avgLatency,
            total_tests: tests.length,
            passed_tests: results.filter((r) => r.passed).length,
            failed_tests: results.filter((r) => !r.passed).length,
            detailed_results: results,
        };
        this.logger.log(`[EvalSuite] Itinerary评测完成: successRate=${successRate.toFixed(2)}, avgPlanLength=${avgPlanLength.toFixed(1)}`);
        return result;
    }
    async evaluateFullPipeline(modelVersion, testCases) {
        this.logger.log(`[EvalSuite] 开始完整流程评测: modelVersion=${modelVersion}`);
        const routerResult = await this.evaluateRouter(modelVersion);
        const gateResult = await this.evaluateGate(modelVersion);
        const itineraryResult = await this.evaluateItinerary(modelVersion);
        const endToEndSuccessRate = (routerResult.accuracy + gateResult.accuracy + itineraryResult.success_rate) / 3;
        const overallScore = routerResult.accuracy * 0.3 +
            gateResult.accuracy * 0.3 +
            itineraryResult.success_rate * 0.4;
        const result = {
            router_result: routerResult,
            gate_result: gateResult,
            itinerary_result: itineraryResult,
            end_to_end_success_rate: endToEndSuccessRate,
            overall_score: overallScore,
            total_tests: routerResult.total_tests + gateResult.total_tests + itineraryResult.total_tests,
            passed_tests: routerResult.passed_tests + gateResult.passed_tests + itineraryResult.passed_tests,
        };
        this.logger.log(`[EvalSuite] 完整流程评测完成: overallScore=${overallScore.toFixed(2)}`);
        return result;
    }
    initializeTestCases() {
        this.testCases.set('ROUTER', this.generateRouterTestCases());
        this.testCases.set('GATE', this.generateGateTestCases());
        this.testCases.set('ITINERARY', this.generateItineraryTestCases());
    }
    getRouterTestCases() {
        return this.testCases.get('ROUTER') || [];
    }
    getGateTestCases() {
        return this.testCases.get('GATE') || [];
    }
    getItineraryTestCases() {
        return this.testCases.get('ITINERARY') || [];
    }
    generateRouterTestCases() {
        return [
            {
                id: 'router_001',
                component: 'ROUTER',
                input: {
                    user_request: 'Plan a trip from Reykjavik to Akureyri',
                    origin: 'Reykjavik',
                    destination: 'Akureyri',
                },
                metadata: {
                    country_code: 'IS',
                    complexity: 'MEDIUM',
                },
            },
        ];
    }
    generateGateTestCases() {
        return [
            {
                id: 'gate_001',
                component: 'GATE',
                input: {
                    user_request: 'Plan a dangerous winter route',
                    origin: 'Reykjavik',
                    destination: 'Akureyri',
                    constraints: {
                        max_ascent_m: 5000,
                    },
                },
                metadata: {
                    risk_level: 'HIGH',
                    country_code: 'IS',
                },
                expected_output: {
                    action: 'REJECT',
                },
            },
        ];
    }
    generateItineraryTestCases() {
        return [
            {
                id: 'itinerary_001',
                component: 'ITINERARY',
                input: {
                    user_request: 'Plan a 3-day trip in Iceland',
                    origin: 'Reykjavik',
                    destination: 'Reykjavik',
                    date_range: {
                        start_date: '2025-06-01',
                        end_date: '2025-06-03',
                    },
                },
                metadata: {
                    country_code: 'IS',
                    complexity: 'LOW',
                },
            },
        ];
    }
    evaluateRouterResult(testCase, response) {
        return response.action === 'ALLOW' || response.action === 'ADJUST';
    }
    calculateRouterMetrics(testCase, response) {
        return {
            confidence: response.confidence || 0,
        };
    }
    extractPlanLength(response) {
        return 0;
    }
    calculateComplexity(testCase, response) {
        var _a;
        const complexityMap = {
            LOW: 0.3,
            MEDIUM: 0.6,
            HIGH: 0.9,
        };
        return complexityMap[((_a = testCase.metadata) === null || _a === void 0 ? void 0 : _a.complexity) || 'MEDIUM'] || 0.5;
    }
    calculateExecutability(response) {
        return response.confidence || 0.5;
    }
    calculateUserSatisfaction(results) {
        const successRate = results.filter((r) => r.passed).length / results.length;
        return successRate * 0.8 + 0.2;
    }
    percentile(sortedArray, p) {
        if (sortedArray.length === 0)
            return 0;
        const index = Math.ceil((p / 100) * sortedArray.length) - 1;
        return sortedArray[Math.max(0, index)] || 0;
    }
};
exports.EvalSuiteService = EvalSuiteService;
exports.EvalSuiteService = EvalSuiteService = EvalSuiteService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [policy_service_manager_service_1.PolicyServiceManagerService])
], EvalSuiteService);
//# sourceMappingURL=eval-suite.service.js.map