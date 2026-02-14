"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var CountryPackGenerateRegressionTestsSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CountryPackGenerateRegressionTestsSkill = void 0;
const common_1 = require("@nestjs/common");
let CountryPackGenerateRegressionTestsSkill = CountryPackGenerateRegressionTestsSkill_1 = class CountryPackGenerateRegressionTestsSkill {
    constructor() {
        this.logger = new common_1.Logger(CountryPackGenerateRegressionTestsSkill_1.name);
        this.metadata = {
            name: 'countryPack.generateRegressionTests',
            description: '为 Pack 生成回归测试用例，确保 Pack 变更不会破坏现有功能',
            version: '1.0.0',
            category: 'countryPack',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 countryPack.generateRegressionTests: type=${input.packType}`);
        if (input.packType === 'readiness') {
            return this.generateReadinessPackTests(input.pack, input.testScenarios);
        }
        else {
            return this.generateRouteDirectionPackTests(input.pack, input.testScenarios);
        }
    }
    generateReadinessPackTests(pack, customScenarios) {
        const tests = [];
        const standardScenarios = customScenarios || [
            {
                name: 'Basic Entry Check',
                context: {
                    traveler: {
                        nationality: 'US',
                    },
                    itinerary: {
                        countries: [pack.geo.countryCode],
                        season: 'summer',
                    },
                },
                expectedOutcomes: ['Should have entry_transit rules'],
            },
            {
                name: 'High Risk Traveler',
                context: {
                    traveler: {
                        nationality: 'CN',
                        riskTolerance: 'low',
                    },
                    itinerary: {
                        countries: [pack.geo.countryCode],
                        activities: ['hiking'],
                        season: 'winter',
                    },
                },
                expectedOutcomes: ['Should have safety_hazards rules'],
            },
            {
                name: 'All Seasons Coverage',
                context: {
                    traveler: {},
                    itinerary: {
                        countries: [pack.geo.countryCode],
                    },
                },
                expectedOutcomes: ['Should work for all supported seasons'],
            },
        ];
        pack.rules.forEach((rule, index) => {
            tests.push({
                id: `test.rule.${rule.id}`,
                name: `Rule: ${rule.id}`,
                description: `Test rule ${rule.id} in category ${rule.category}`,
                type: 'readiness',
                input: {
                    packId: pack.packId,
                    context: this.buildTestContext(rule, pack),
                },
                assertions: [
                    {
                        type: 'rule_triggered',
                        description: `Rule ${rule.id} should be triggered`,
                        check: `result.findings[0].rules.some(r => r.id === '${rule.id}')`,
                    },
                    {
                        type: 'action_level',
                        description: `Action level should be ${rule.then.level}`,
                        check: `result.findings[0].rules.find(r => r.id === '${rule.id}').then.level === '${rule.then.level}'`,
                    },
                ],
            });
        });
        standardScenarios.forEach((scenario, index) => {
            var _a;
            tests.push({
                id: `test.scenario.${index + 1}`,
                name: scenario.name,
                description: `Test scenario: ${scenario.name}`,
                type: 'readiness',
                input: {
                    packId: pack.packId,
                    context: scenario.context,
                },
                expectedOutput: scenario.expectedOutcomes,
                assertions: ((_a = scenario.expectedOutcomes) === null || _a === void 0 ? void 0 : _a.map(outcome => ({
                    type: 'outcome_check',
                    description: outcome,
                    check: `result.findings[0].${outcome.toLowerCase().replace(/\s+/g, '_')}`,
                }))) || [],
            });
        });
        tests.push({
            id: 'test.structure',
            name: 'Pack Structure Validation',
            description: 'Validate pack structure and required fields',
            type: 'readiness',
            input: {
                pack,
            },
            assertions: [
                {
                    type: 'structure',
                    description: 'Pack should have all required fields',
                    check: "pack.packId && pack.destinationId && pack.version && pack.rules && pack.checklists",
                },
                {
                    type: 'rules_count',
                    description: 'Pack should have at least one rule',
                    check: 'pack.rules.length > 0',
                },
                {
                    type: 'checklists_count',
                    description: 'Pack should have at least one checklist',
                    check: 'pack.checklists.length > 0',
                },
            ],
        });
        return {
            tests,
            summary: {
                totalTests: tests.length,
                testTypes: {
                    rule: pack.rules.length,
                    scenario: standardScenarios.length,
                    structure: 1,
                },
            },
        };
    }
    generateRouteDirectionPackTests(pack, customScenarios) {
        const tests = [];
        pack.routeDirections.forEach((rd, index) => {
            tests.push({
                id: `test.rd.${rd.name}`,
                name: `RouteDirection: ${rd.name}`,
                description: `Test route direction ${rd.name}`,
                type: 'routeDirection',
                input: {
                    countryCode: pack.countryCode,
                    routeDirectionName: rd.name,
                    userIntent: {
                        preferences: rd.tags || [],
                    },
                },
                assertions: [
                    {
                        type: 'rd_found',
                        description: `RouteDirection ${rd.name} should be found`,
                        check: `result.routeDirection.name === '${rd.name}'`,
                    },
                    {
                        type: 'country_match',
                        description: `Country code should match`,
                        check: `result.routeDirection.countryCode === '${pack.countryCode}'`,
                    },
                ],
            });
        });
        tests.push({
            id: 'test.import',
            name: 'Pack Import Test',
            description: 'Test importing the entire pack',
            type: 'routeDirection',
            input: {
                pack,
            },
            assertions: [
                {
                    type: 'import_success',
                    description: 'All route directions should be imported successfully',
                    check: 'result.successCount === pack.routeDirections.length',
                },
                {
                    type: 'no_errors',
                    description: 'No import errors',
                    check: 'result.failedCount === 0',
                },
            ],
        });
        tests.push({
            id: 'test.structure',
            name: 'Pack Structure Validation',
            description: 'Validate pack structure and required fields',
            type: 'routeDirection',
            input: {
                pack,
            },
            assertions: [
                {
                    type: 'structure',
                    description: 'Pack should have all required fields',
                    check: "pack.countryCode && pack.countryName && pack.routeDirections",
                },
                {
                    type: 'route_directions_count',
                    description: 'Pack should have at least one route direction',
                    check: 'pack.routeDirections.length > 0',
                },
            ],
        });
        return {
            tests,
            summary: {
                totalTests: tests.length,
                testTypes: {
                    routeDirection: pack.routeDirections.length,
                    import: 1,
                    structure: 1,
                },
            },
        };
    }
    buildTestContext(rule, pack) {
        var _a, _b;
        const context = {
            itinerary: {
                countries: [pack.geo.countryCode],
                season: pack.supportedSeasons[0] || 'summer',
            },
        };
        if (rule.appliesTo) {
            if (rule.appliesTo.activities) {
                context.itinerary = {
                    countries: [pack.geo.countryCode],
                    season: ((_a = context.itinerary) === null || _a === void 0 ? void 0 : _a.season) || pack.supportedSeasons[0] || 'summer',
                    activities: rule.appliesTo.activities,
                };
            }
            if (rule.appliesTo.seasons) {
                context.itinerary = {
                    countries: [pack.geo.countryCode],
                    season: rule.appliesTo.seasons[0],
                    ...(((_b = context.itinerary) === null || _b === void 0 ? void 0 : _b.activities) ? { activities: context.itinerary.activities } : {}),
                };
            }
        }
        return context;
    }
};
exports.CountryPackGenerateRegressionTestsSkill = CountryPackGenerateRegressionTestsSkill;
exports.CountryPackGenerateRegressionTestsSkill = CountryPackGenerateRegressionTestsSkill = CountryPackGenerateRegressionTestsSkill_1 = __decorate([
    (0, common_1.Injectable)()
], CountryPackGenerateRegressionTestsSkill);
//# sourceMappingURL=country-pack-generate-regression-tests.skill.js.map