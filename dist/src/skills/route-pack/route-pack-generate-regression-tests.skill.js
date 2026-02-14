"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var RoutePackGenerateRegressionTestsSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoutePackGenerateRegressionTestsSkill = void 0;
const common_1 = require("@nestjs/common");
let RoutePackGenerateRegressionTestsSkill = RoutePackGenerateRegressionTestsSkill_1 = class RoutePackGenerateRegressionTestsSkill {
    constructor() {
        this.logger = new common_1.Logger(RoutePackGenerateRegressionTestsSkill_1.name);
        this.metadata = {
            name: 'routePack.generateRegressionTests',
            description: '为 RoutePack 生成回归测试用例，确保 Pack 变更不会破坏现有功能',
            version: '1.0.0',
            category: 'countryPack',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 routePack.generateRegressionTests: packId=${input.pack.metadata.packId}`);
        const tests = [];
        const countryCode = input.pack.metadata.countryCode;
        const packId = input.pack.metadata.packId;
        const standardScenarios = input.testScenarios || [
            {
                name: 'Basic Route Selection',
                context: {
                    countryCode,
                    season: 7,
                    userProfile: {
                        pacePreference: 'MEDIUM',
                        altitudeTolerance: 'MEDIUM',
                        riskTolerance: 'MEDIUM',
                    },
                },
                expectedOutcomes: ['Route should be selectable', 'Constraints should be valid'],
            },
            {
                name: 'High Altitude Route',
                context: {
                    countryCode,
                    season: 7,
                    userProfile: {
                        pacePreference: 'SLOW',
                        altitudeTolerance: 'HIGH',
                        riskTolerance: 'LOW',
                    },
                },
                expectedOutcomes: ['Altitude constraints should be checked', 'Risk profile should be evaluated'],
            },
            {
                name: 'Winter Route',
                context: {
                    countryCode,
                    season: 1,
                    userProfile: {
                        pacePreference: 'MEDIUM',
                        altitudeTolerance: 'MEDIUM',
                        riskTolerance: 'MEDIUM',
                    },
                },
                expectedOutcomes: ['Seasonality should be checked', 'Weather risks should be evaluated'],
            },
        ];
        standardScenarios.forEach((scenario, index) => {
            const testId = `${packId}:test:${index + 1}`;
            const constraintBlocks = input.pack.blocks.filter((b) => b.type === 'constraint');
            const riskBlocks = input.pack.blocks.filter((b) => b.type === 'risk' || b.type === 'safety');
            const seasonalityBlocks = input.pack.blocks.filter((b) => b.type === 'seasonality');
            const assertions = [];
            if (constraintBlocks.length > 0) {
                assertions.push({
                    type: 'constraint',
                    description: 'Constraint blocks should be present and valid',
                    check: `constraintBlocks.length > 0 && constraintBlocks.every(b => b.evidence && b.evidence.length > 0)`,
                });
            }
            if (riskBlocks.length > 0) {
                assertions.push({
                    type: 'risk',
                    description: 'Risk blocks should be present and valid',
                    check: `riskBlocks.length > 0 && riskBlocks.every(b => b.evidence && b.evidence.length > 0)`,
                });
            }
            if (scenario.context.season && seasonalityBlocks.length > 0) {
                assertions.push({
                    type: 'seasonality',
                    description: 'Seasonality blocks should be present and valid',
                    check: `seasonalityBlocks.length > 0 && seasonalityBlocks.every(b => b.evidence && b.evidence.length > 0)`,
                });
            }
            assertions.push({
                type: 'evidence',
                description: 'All blocks should have evidence for RAG credibility',
                check: `pack.blocks.every(b => b.evidence && b.evidence.length > 0 && b.source && b.lastVerifiedAt)`,
            });
            assertions.push({
                type: 'metadata',
                description: 'Pack metadata should be complete',
                check: `pack.metadata.packId && pack.metadata.countryCode && pack.metadata.version && pack.metadata.lastVerifiedAt`,
            });
            tests.push({
                id: testId,
                name: scenario.name,
                description: `Test ${scenario.name} for RoutePack ${packId}`,
                type: 'routePack',
                input: {
                    pack: input.pack,
                    context: scenario.context,
                },
                expectedOutput: {
                    outcomes: scenario.expectedOutcomes || [],
                },
                assertions,
            });
        });
        const testTypes = {};
        tests.forEach((test) => {
            test.assertions.forEach((assertion) => {
                testTypes[assertion.type] = (testTypes[assertion.type] || 0) + 1;
            });
        });
        return {
            tests,
            summary: {
                totalTests: tests.length,
                testTypes,
            },
        };
    }
};
exports.RoutePackGenerateRegressionTestsSkill = RoutePackGenerateRegressionTestsSkill;
exports.RoutePackGenerateRegressionTestsSkill = RoutePackGenerateRegressionTestsSkill = RoutePackGenerateRegressionTestsSkill_1 = __decorate([
    (0, common_1.Injectable)()
], RoutePackGenerateRegressionTestsSkill);
//# sourceMappingURL=route-pack-generate-regression-tests.skill.js.map