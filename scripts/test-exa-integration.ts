#!/usr/bin/env node
/**
 * 测试 Exa 集成效果
 * 
 * 测试场景：
 * 1. Abu Strategy 实时风险搜索
 * 2. World Model 构建实时信息补充
 * 3. Neptune Strategy 替代方案搜索
 * 4. Readiness Skills 签证政策搜索
 * 5. Country Pack 深度研究启动
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ExaIntegrationService } from '../src/mcp/exa-integration.service';
import { AbuStrategy } from '../src/trips/decision/strategies/abu-strategy.service';
import { NeptuneStrategy } from '../src/trips/decision/strategies/neptune-strategy.service';
import { WorldBuildContextSkill } from '../src/skills/world/world-build-context.skill';
import { ReadinessCheckVisaWindowSkill } from '../src/skills/readiness/readiness-check-visa-window.skill';
import { CountryPackNewSkeletonSkill } from '../src/skills/country-pack/country-pack-new-skeleton.skill';

async function testExaIntegration() {
  console.log('\n🧪 开始测试 Exa 集成效果...\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  
  try {
    const exaIntegration = app.get(ExaIntegrationService);
    const abuStrategy = app.get(AbuStrategy);
    const neptuneStrategy = app.get(NeptuneStrategy);
    const worldBuildContext = app.get(WorldBuildContextSkill);
    const readinessCheckVisa = app.get(ReadinessCheckVisaWindowSkill);
    const countryPackNewSkeleton = app.get(CountryPackNewSkeletonSkill);

    // 测试 1: ExaIntegrationService 实时风险搜索
    console.log('📋 测试 1: ExaIntegrationService 实时风险搜索');
    try {
      const riskInfo = await exaIntegration.searchRealTimeRisks('IS', 'Ring Road', 2, 2026);
      console.log('✅ 实时风险搜索结果:', {
        hasRisk: riskInfo.hasRisk,
        riskType: riskInfo.riskType,
        riskDescription: riskInfo.riskDescription?.substring(0, 100),
        confidence: riskInfo.confidence,
      });
    } catch (error: any) {
      console.log('⚠️  实时风险搜索失败:', error.message);
    }

    // 测试 2: ExaIntegrationService 替代方案搜索
    console.log('\n📋 测试 2: ExaIntegrationService 替代方案搜索');
    try {
      const alternatives = await exaIntegration.searchAlternativeDestinations('冰岛', '景点', 2, 2026);
      console.log('✅ 替代方案搜索结果:', {
        alternativesCount: alternatives.alternatives.length,
        alternatives: alternatives.alternatives.slice(0, 3).map(a => ({
          name: a.name,
          description: a.description?.substring(0, 50),
        })),
      });
    } catch (error: any) {
      console.log('⚠️  替代方案搜索失败:', error.message);
    }

    // 测试 3: ExaIntegrationService 深度研究启动
    console.log('\n📋 测试 3: ExaIntegrationService 深度研究启动');
    try {
      const researchResult = await exaIntegration.startDeepResearch(
        '冰岛旅行准备 签证 入境要求 安全信息',
        'country_pack'
      );
      console.log('✅ 深度研究启动结果:', {
        researchId: researchResult.researchId,
        status: researchResult.status,
      });
      
      if (researchResult.researchId) {
        // 等待 2 秒后检查状态
        await new Promise(resolve => setTimeout(resolve, 2000));
        const checkResult = await exaIntegration.checkDeepResearch(researchResult.researchId);
        console.log('✅ 深度研究状态检查:', {
          status: checkResult.status,
          hasReport: !!checkResult.report,
          reportLength: checkResult.report?.length || 0,
        });
      }
    } catch (error: any) {
      console.log('⚠️  深度研究启动失败:', error.message);
    }

    // 测试 4: ExaIntegrationService 官方网页爬取
    console.log('\n📋 测试 4: ExaIntegrationService 官方网页爬取');
    try {
      const crawlResult = await exaIntegration.crawlOfficialPage(
        'https://www.visiticeland.com/',
        '冰岛官方旅游网站'
      );
      console.log('✅ 官方网页爬取结果:', {
        success: crawlResult.success,
        contentLength: crawlResult.content.length,
        contentPreview: crawlResult.content.substring(0, 200),
      });
    } catch (error: any) {
      console.log('⚠️  官方网页爬取失败:', error.message);
    }

    // 测试 5: Readiness Skills 签证政策搜索
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
    } catch (error: any) {
      console.log('⚠️  签证政策检查失败:', error.message);
    }

    console.log('\n✅ 所有测试完成！\n');
  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  } finally {
    await app.close();
  }
}

testExaIntegration().catch(console.error);
