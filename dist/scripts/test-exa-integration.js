#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("../src/app.module");
const exa_integration_service_1 = require("../src/mcp/exa-integration.service");
const abu_strategy_service_1 = require("../src/trips/decision/strategies/abu-strategy.service");
const neptune_strategy_service_1 = require("../src/trips/decision/strategies/neptune-strategy.service");
const world_build_context_skill_1 = require("../src/skills/world/world-build-context.skill");
const readiness_check_visa_window_skill_1 = require("../src/skills/readiness/readiness-check-visa-window.skill");
const country_pack_new_skeleton_skill_1 = require("../src/skills/country-pack/country-pack-new-skeleton.skill");
async function testExaIntegration() {
    var _a, _b;
    console.log('\n🧪 开始测试 Exa 集成效果...\n');
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    try {
        const exaIntegration = app.get(exa_integration_service_1.ExaIntegrationService);
        const abuStrategy = app.get(abu_strategy_service_1.AbuStrategy);
        const neptuneStrategy = app.get(neptune_strategy_service_1.NeptuneStrategy);
        const worldBuildContext = app.get(world_build_context_skill_1.WorldBuildContextSkill);
        const readinessCheckVisa = app.get(readiness_check_visa_window_skill_1.ReadinessCheckVisaWindowSkill);
        const countryPackNewSkeleton = app.get(country_pack_new_skeleton_skill_1.CountryPackNewSkeletonSkill);
        console.log('📋 测试 1: ExaIntegrationService 实时风险搜索');
        try {
            const riskInfo = await exaIntegration.searchRealTimeRisks('IS', 'Ring Road', 2, 2026);
            console.log('✅ 实时风险搜索结果:', {
                hasRisk: riskInfo.hasRisk,
                riskType: riskInfo.riskType,
                riskDescription: (_a = riskInfo.riskDescription) === null || _a === void 0 ? void 0 : _a.substring(0, 100),
                confidence: riskInfo.confidence,
            });
        }
        catch (error) {
            console.log('⚠️  实时风险搜索失败:', error.message);
        }
        console.log('\n📋 测试 2: ExaIntegrationService 替代方案搜索');
        try {
            const alternatives = await exaIntegration.searchAlternativeDestinations('冰岛', '景点', 2, 2026);
            console.log('✅ 替代方案搜索结果:', {
                alternativesCount: alternatives.alternatives.length,
                alternatives: alternatives.alternatives.slice(0, 3).map(a => {
                    var _a;
                    return ({
                        name: a.name,
                        description: (_a = a.description) === null || _a === void 0 ? void 0 : _a.substring(0, 50),
                    });
                }),
            });
        }
        catch (error) {
            console.log('⚠️  替代方案搜索失败:', error.message);
        }
        console.log('\n📋 测试 3: ExaIntegrationService 深度研究启动');
        try {
            const researchResult = await exaIntegration.startDeepResearch('冰岛旅行准备 签证 入境要求 安全信息', 'country_pack');
            console.log('✅ 深度研究启动结果:', {
                researchId: researchResult.researchId,
                status: researchResult.status,
            });
            if (researchResult.researchId) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                const checkResult = await exaIntegration.checkDeepResearch(researchResult.researchId);
                console.log('✅ 深度研究状态检查:', {
                    status: checkResult.status,
                    hasReport: !!checkResult.report,
                    reportLength: ((_b = checkResult.report) === null || _b === void 0 ? void 0 : _b.length) || 0,
                });
            }
        }
        catch (error) {
            console.log('⚠️  深度研究启动失败:', error.message);
        }
        console.log('\n📋 测试 4: ExaIntegrationService 官方网页爬取');
        try {
            const crawlResult = await exaIntegration.crawlOfficialPage('https://www.visiticeland.com/', '冰岛官方旅游网站');
            console.log('✅ 官方网页爬取结果:', {
                success: crawlResult.success,
                contentLength: crawlResult.content.length,
                contentPreview: crawlResult.content.substring(0, 200),
            });
        }
        catch (error) {
            console.log('⚠️  官方网页爬取失败:', error.message);
        }
        console.log('\n📋 测试 5: Readiness Skills 签证政策搜索');
        try {
            const visaResult = await readinessCheckVisa.execute({
                tripMeta: {
                    departureCountryCode: 'CN',
                    destinationCountryCode: 'IS',
                    departureDate: '2026-06-01',
                    returnDate: '2026-06-15',
                    nationality: 'CN',
                },
            });
            console.log('✅ 签证政策检查结果:', {
                visaRiskLevel: visaResult.visaRiskLevel,
                recommendedLeadTime: visaResult.recommendedLeadTime,
                visaStatus: visaResult.visaStatus,
                specialRulesCount: visaResult.specialRules.length,
            });
        }
        catch (error) {
            console.log('⚠️  签证政策检查失败:', error.message);
        }
        console.log('\n✅ 所有测试完成！\n');
    }
    catch (error) {
        console.error('❌ 测试失败:', error.message);
        console.error(error.stack);
    }
    finally {
        await app.close();
    }
}
testExaIntegration().catch(console.error);
//# sourceMappingURL=test-exa-integration.js.map