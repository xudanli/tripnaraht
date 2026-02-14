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
var SecurityRedTeamService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityRedTeamService = void 0;
const common_1 = require("@nestjs/common");
const constraints_engine_service_1 = require("./constraints-engine.service");
const crypto_1 = require("crypto");
let SecurityRedTeamService = SecurityRedTeamService_1 = class SecurityRedTeamService {
    constructor(constraintsEngine) {
        this.constraintsEngine = constraintsEngine;
        this.logger = new common_1.Logger(SecurityRedTeamService_1.name);
        this.testCases = new Map();
        this.initializeTestCases();
    }
    createTestCase(testCase) {
        const fullTestCase = {
            ...testCase,
            test_id: `test_${(0, crypto_1.randomUUID)()}`,
        };
        this.testCases.set(fullTestCase.test_id, fullTestCase);
        this.logger.log(`[SecurityRedTeam] 创建测试用例: testId=${fullTestCase.test_id}, name=${fullTestCase.name}`);
        return fullTestCase;
    }
    async runRedTeamTests(testCaseIds) {
        var _a, _b;
        this.logger.log(`[SecurityRedTeam] 开始运行红队测试: testCaseIds=${(testCaseIds === null || testCaseIds === void 0 ? void 0 : testCaseIds.length) || 'all'}`);
        const testsToRun = testCaseIds
            ? testCaseIds.map((id) => this.testCases.get(id)).filter(Boolean)
            : Array.from(this.testCases.values());
        const results = [];
        for (const testCase of testsToRun) {
            try {
                const startTime = Date.now();
                const constraintResult = await this.constraintsEngine.checkConstraints(testCase.input, {
                    country_code: (_a = testCase.metadata) === null || _a === void 0 ? void 0 : _a.country_code,
                    season: (_b = testCase.metadata) === null || _b === void 0 ? void 0 : _b.season,
                });
                const executionTime = Date.now() - startTime;
                const actualResult = {
                    blocked: constraintResult.is_blocked,
                    sev_level: constraintResult.sev_level,
                    requires_approval: constraintResult.requires_approval,
                    violations: constraintResult.violations,
                };
                const passed = actualResult.blocked === testCase.expected_result.should_block &&
                    actualResult.sev_level === testCase.expected_result.sev_level &&
                    actualResult.requires_approval === testCase.expected_result.required_approval;
                const result = {
                    test_id: testCase.test_id,
                    test_case: testCase,
                    actual_result: actualResult,
                    passed,
                    execution_time_ms: executionTime,
                };
                results.push(result);
                if (!passed) {
                    this.logger.warn(`[SecurityRedTeam] 测试用例未通过: testId=${testCase.test_id}, name=${testCase.name}`);
                }
            }
            catch (error) {
                this.logger.error(`[SecurityRedTeam] 测试用例执行失败: testId=${testCase.test_id}, error=${error === null || error === void 0 ? void 0 : error.message}`);
                results.push({
                    test_id: testCase.test_id,
                    test_case: testCase,
                    actual_result: {
                        blocked: false,
                        sev_level: 'SEV-4',
                        requires_approval: false,
                        violations: [],
                    },
                    passed: false,
                    execution_time_ms: 0,
                    error: error === null || error === void 0 ? void 0 : error.message,
                });
            }
        }
        const passedCount = results.filter((r) => r.passed).length;
        this.logger.log(`[SecurityRedTeam] 红队测试完成: passed=${passedCount}/${results.length}`);
        return results;
    }
    initializeTestCases() {
        this.createTestCase({
            name: '冰岛冬季危险路线',
            category: 'HIGH_RISK_DESTINATION',
            description: '测试冰岛冬季危险路线的约束检查',
            input: {
                country_code: 'IS',
                season: 'WINTER',
                route: {
                    difficulty: 'EXTREME',
                    weather_risk: 'HIGH',
                },
            },
            expected_result: {
                should_block: true,
                sev_level: 'SEV-1',
                required_approval: false,
            },
            metadata: {
                country_code: 'IS',
                season: 'WINTER',
            },
        });
        this.createTestCase({
            name: '雨季高风险路线',
            category: 'HIGH_RISK_SEASON',
            description: '测试雨季高风险路线的约束检查',
            input: {
                season: 'RAINY',
                route: {
                    flood_risk: 'HIGH',
                },
            },
            expected_result: {
                should_block: false,
                sev_level: 'SEV-2',
                required_approval: true,
            },
            metadata: {
                season: 'RAINY',
            },
        });
        this.createTestCase({
            name: '极端天气条件',
            category: 'EDGE_CASE',
            description: '测试极端天气条件的约束检查',
            input: {
                weather: {
                    wind_speed: 30,
                    visibility: 0.1,
                },
            },
            expected_result: {
                should_block: true,
                sev_level: 'SEV-1',
                required_approval: false,
            },
            metadata: {},
        });
    }
    getTestCase(testId) {
        return this.testCases.get(testId);
    }
    listTestCases(category) {
        let cases = Array.from(this.testCases.values());
        if (category) {
            cases = cases.filter((c) => c.category === category);
        }
        return cases;
    }
};
exports.SecurityRedTeamService = SecurityRedTeamService;
exports.SecurityRedTeamService = SecurityRedTeamService = SecurityRedTeamService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [constraints_engine_service_1.ConstraintsEngineService])
], SecurityRedTeamService);
//# sourceMappingURL=security-red-team.service.js.map