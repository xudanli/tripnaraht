"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var TestCaseManagerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestCaseManagerService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
let TestCaseManagerService = TestCaseManagerService_1 = class TestCaseManagerService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(TestCaseManagerService_1.name);
        this.testCasesCache = new Map();
        this.testCasesDir =
            this.configService.get('TEST_CASES_DIR') ||
                path.join(process.cwd(), 'data', 'test-cases');
    }
    async loadTestCasesFromFile(component) {
        const fileName = `${component.toLowerCase()}_test_cases.json`;
        const filePath = path.join(this.testCasesDir, fileName);
        try {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const testCases = JSON.parse(fileContent);
            const validTestCases = testCases.filter((tc) => this.validateTestCase(tc, component));
            this.logger.log(`[TestCaseManager] 从文件加载测试用例: component=${component}, count=${validTestCases.length}`);
            return validTestCases;
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                this.logger.warn(`[TestCaseManager] 测试用例文件不存在: ${filePath}，返回示例用例`);
                return this.getDefaultTestCases(component);
            }
            this.logger.error(`[TestCaseManager] 加载测试用例失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            return this.getDefaultTestCases(component);
        }
    }
    async getRouterTestCases() {
        const cacheKey = 'ROUTER';
        if (this.testCasesCache.has(cacheKey)) {
            return this.testCasesCache.get(cacheKey);
        }
        const testCases = await this.loadTestCasesFromFile('ROUTER');
        this.testCasesCache.set(cacheKey, testCases);
        return testCases;
    }
    async getGateTestCases() {
        const cacheKey = 'GATE';
        if (this.testCasesCache.has(cacheKey)) {
            return this.testCasesCache.get(cacheKey);
        }
        const testCases = await this.loadTestCasesFromFile('GATE');
        this.testCasesCache.set(cacheKey, testCases);
        return testCases;
    }
    async getItineraryTestCases() {
        const cacheKey = 'ITINERARY';
        if (this.testCasesCache.has(cacheKey)) {
            return this.testCasesCache.get(cacheKey);
        }
        const testCases = await this.loadTestCasesFromFile('ITINERARY');
        this.testCasesCache.set(cacheKey, testCases);
        return testCases;
    }
    async addTestCase(testCase) {
        const component = testCase.component;
        const testCases = await this.loadTestCasesFromFile(component);
        testCases.push(testCase);
        const fileName = `${component.toLowerCase()}_test_cases.json`;
        const filePath = path.join(this.testCasesDir, fileName);
        await fs.mkdir(this.testCasesDir, { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(testCases, null, 2), 'utf-8');
        this.testCasesCache.delete(component);
        this.logger.log(`[TestCaseManager] 添加测试用例: component=${component}, id=${testCase.id}`);
    }
    validateTestCase(testCase, expectedComponent) {
        if (!testCase.id || !testCase.component || !testCase.input) {
            return false;
        }
        if (testCase.component !== expectedComponent) {
            return false;
        }
        return true;
    }
    getDefaultTestCases(component) {
        switch (component) {
            case 'ROUTER':
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
                    {
                        id: 'router_002',
                        component: 'ROUTER',
                        input: {
                            user_request: 'I want to visit Iceland for 7 days',
                            origin: undefined,
                            destination: 'IS',
                        },
                        metadata: {
                            country_code: 'IS',
                            complexity: 'LOW',
                        },
                    },
                ];
            case 'GATE':
                return [
                    {
                        id: 'gate_001',
                        component: 'GATE',
                        input: {
                            user_request: 'Plan a trip to Iceland in winter',
                            origin: undefined,
                            destination: 'IS',
                            season: 'WINTER',
                        },
                        metadata: {
                            country_code: 'IS',
                            risk_level: 'HIGH',
                        },
                    },
                    {
                        id: 'gate_002',
                        component: 'GATE',
                        input: {
                            user_request: 'Plan a trip to a dangerous area',
                            origin: undefined,
                            destination: 'HIGH_RISK_AREA',
                        },
                        metadata: {
                            country_code: undefined,
                            risk_level: 'CRITICAL',
                        },
                    },
                ];
            case 'ITINERARY':
                return [
                    {
                        id: 'itinerary_001',
                        component: 'ITINERARY',
                        input: {
                            user_request: 'Plan a 7-day trip to Iceland',
                            origin: 'Reykjavik',
                            destination: 'Reykjavik',
                            duration_days: 7,
                        },
                        metadata: {
                            country_code: 'IS',
                            complexity: 'MEDIUM',
                        },
                    },
                    {
                        id: 'itinerary_002',
                        component: 'ITINERARY',
                        input: {
                            user_request: 'Plan a weekend trip to Reykjavik',
                            origin: 'Reykjavik',
                            destination: 'Reykjavik',
                            duration_days: 2,
                        },
                        metadata: {
                            country_code: 'IS',
                            complexity: 'LOW',
                        },
                    },
                ];
            default:
                return [];
        }
    }
    clearCache() {
        this.testCasesCache.clear();
        this.logger.log('[TestCaseManager] 测试用例缓存已清除');
    }
};
exports.TestCaseManagerService = TestCaseManagerService;
exports.TestCaseManagerService = TestCaseManagerService = TestCaseManagerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], TestCaseManagerService);
//# sourceMappingURL=test-case-manager.service.js.map