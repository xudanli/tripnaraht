#!/usr/bin/env npx tsx
/**
 * 内陆高地F路 RouteDirection 测试验证脚本
 * 
 * 验证数据完整性、准确性和一致性
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

const HIGHLANDS_FROAD_UUID = '8afd4b2e-7dd1-4837-8169-d3efed748138';

interface ValidationResult {
  category: string;
  field: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  message: string;
  details?: any;
}

const results: ValidationResult[] = [];

function addResult(category: string, field: string, status: 'PASS' | 'WARN' | 'FAIL', message: string, details?: any) {
  results.push({ category, field, status, message, details });
}

async function main() {
  log('='.repeat(80), 'cyan');
  log('内陆高地F路 RouteDirection 测试验证', 'bright');
  log('='.repeat(80), 'cyan');
  console.log('');

  const prisma = new PrismaClient();

  try {
    // 1. 基础数据验证
    log('【1. 基础数据验证】', 'cyan');
    const rd = await prisma.routeDirection.findFirst({
      where: { uuid: HIGHLANDS_FROAD_UUID },
      include: { RouteTemplate: true },
    });

    if (!rd) {
      log('❌ RouteDirection 不存在', 'red');
      process.exit(1);
    }

    // 1.1 必填字段检查
    log('  1.1 必填字段检查...', 'yellow');
    if (rd.name && rd.nameCN && rd.countryCode) {
      addResult('基础数据', '必填字段', 'PASS', '所有必填字段存在');
      log('    ✅ 必填字段完整', 'green');
    } else {
      addResult('基础数据', '必填字段', 'FAIL', '缺少必填字段', { name: rd.name, nameCN: rd.nameCN, countryCode: rd.countryCode });
      log('    ❌ 缺少必填字段', 'red');
    }

    // 1.2 标签验证
    log('  1.2 标签验证...', 'yellow');
    const expectedTags = ['extreme', 'high'];
    const hasExtremeTag = rd.tags.some(t => t.toLowerCase().includes('extreme') || t.includes('极端'));
    const hasHighRiskTag = rd.tags.some(t => t.toLowerCase().includes('high') || t.includes('高'));
    
    if (hasExtremeTag && hasHighRiskTag) {
      addResult('基础数据', '标签', 'PASS', '标签符合预期', { tags: rd.tags });
      log(`    ✅ 标签正确: ${rd.tags.join(', ')}`, 'green');
    } else {
      addResult('基础数据', '标签', 'WARN', '标签可能不完整', { tags: rd.tags, expected: expectedTags });
      log(`    ⚠️  标签: ${rd.tags.join(', ')}`, 'yellow');
    }

    // 1.3 描述验证
    log('  1.3 描述验证...', 'yellow');
    if (rd.description && rd.description.length > 20) {
      addResult('基础数据', '描述', 'PASS', '描述完整', { length: rd.description.length });
      log(`    ✅ 描述: ${rd.description.substring(0, 50)}...`, 'green');
    } else {
      addResult('基础数据', '描述', 'WARN', '描述可能过短', { length: rd.description?.length || 0 });
      log('    ⚠️  描述可能过短', 'yellow');
    }

    console.log('');

    // 2. 季节性数据验证
    log('【2. 季节性数据验证】', 'cyan');
    const seasonality = rd.seasonality as any;
    
    if (seasonality) {
      log('  2.1 最佳季节...', 'yellow');
      const bestSeasons = seasonality.best_seasons || seasonality.bestMonths;
      if (bestSeasons && (bestSeasons.includes('7月') || bestSeasons.includes(7) || bestSeasons.includes(8))) {
        addResult('季节性', '最佳季节', 'PASS', '最佳季节正确', bestSeasons);
        log(`    ✅ 最佳季节: ${JSON.stringify(bestSeasons)}`, 'green');
      } else {
        addResult('季节性', '最佳季节', 'WARN', '最佳季节可能不准确', bestSeasons);
        log(`    ⚠️  最佳季节: ${JSON.stringify(bestSeasons)}`, 'yellow');
      }

      log('  2.2 开放时间...', 'yellow');
      const seasonalConsiderations = seasonality.seasonal_considerations;
      if (seasonalConsiderations) {
        const onlySeason = seasonalConsiderations.only_season;
        if (onlySeason && onlySeason.includes('夏季')) {
          addResult('季节性', '开放时间', 'PASS', '开放时间描述正确', seasonalConsiderations);
          log(`    ✅ 仅夏季开放: ${onlySeason}`, 'green');
        } else {
          addResult('季节性', '开放时间', 'WARN', '开放时间描述可能不准确', seasonalConsiderations);
          log(`    ⚠️  开放时间: ${JSON.stringify(seasonalConsiderations)}`, 'yellow');
        }
      }
    } else {
      addResult('季节性', '数据完整性', 'FAIL', '缺少季节性数据');
      log('    ❌ 缺少季节性数据', 'red');
    }

    console.log('');

    // 3. 约束条件验证
    log('【3. 约束条件验证】', 'cyan');
    const constraints = rd.constraints as any;
    
    if (constraints) {
      log('  3.1 车辆要求...', 'yellow');
      const suitableVehicle = constraints.suitable_vehicle;
      if (suitableVehicle && (suitableVehicle.includes('四驱') || suitableVehicle.includes('4WD'))) {
        addResult('约束条件', '车辆要求', 'PASS', '车辆要求正确', suitableVehicle);
        log(`    ✅ 车辆要求: ${suitableVehicle}`, 'green');
      } else {
        addResult('约束条件', '车辆要求', 'FAIL', '车辆要求不明确', suitableVehicle);
        log(`    ❌ 车辆要求: ${suitableVehicle || '未指定'}`, 'red');
      }

      log('  3.2 难度等级...', 'yellow');
      const difficultyLevel = constraints.difficulty_level;
      if (difficultyLevel === 'extreme') {
        addResult('约束条件', '难度等级', 'PASS', '难度等级正确', difficultyLevel);
        log(`    ✅ 难度等级: ${difficultyLevel}`, 'green');
      } else {
        addResult('约束条件', '难度等级', 'WARN', '难度等级可能不准确', difficultyLevel);
        log(`    ⚠️  难度等级: ${difficultyLevel}`, 'yellow');
      }

      log('  3.3 距离和天数...', 'yellow');
      const totalDistance = constraints.total_distance_km;
      const durationDays = constraints.duration_days;
      if (totalDistance && durationDays) {
        addResult('约束条件', '距离和天数', 'PASS', '距离和天数已指定', { totalDistance, durationDays });
        log(`    ✅ 总距离: ${totalDistance}km, 天数: ${durationDays}天`, 'green');
      } else {
        addResult('约束条件', '距离和天数', 'WARN', '距离或天数未指定', { totalDistance, durationDays });
        log(`    ⚠️  总距离: ${totalDistance || '未指定'}, 天数: ${durationDays || '未指定'}`, 'yellow');
      }
    } else {
      addResult('约束条件', '数据完整性', 'FAIL', '缺少约束条件数据');
      log('    ❌ 缺少约束条件数据', 'red');
    }

    console.log('');

    // 4. 风险画像验证
    log('【4. 风险画像验证】', 'cyan');
    const riskProfile = rd.riskProfile as any;
    
    if (riskProfile) {
      const riskLevel = riskProfile.risk_level;
      if (riskLevel === 'high') {
        addResult('风险画像', '风险等级', 'PASS', '风险等级正确', riskLevel);
        log(`    ✅ 风险等级: ${riskLevel}`, 'green');
      } else {
        addResult('风险画像', '风险等级', 'WARN', '风险等级可能不准确', riskLevel);
        log(`    ⚠️  风险等级: ${riskLevel}`, 'yellow');
      }
    } else {
      addResult('风险画像', '数据完整性', 'WARN', '缺少风险画像数据');
      log('    ⚠️  缺少风险画像数据', 'yellow');
    }

    console.log('');

    // 5. 标志性POI验证
    log('【5. 标志性POI验证】', 'cyan');
    const signaturePois = rd.signaturePois as any;
    
    if (signaturePois) {
      const examples = signaturePois.examples || [];
      const expectedPois = ['Landmannalaugar', 'Þórsmörk', 'Askja', 'Kerlingarfjöll'];
      const foundPois = expectedPois.filter(poi => 
        examples.some((ex: any) => 
          (typeof ex === 'string' && ex.includes(poi)) ||
          (ex?.name && ex.name.includes(poi))
        )
      );

      if (foundPois.length >= 3) {
        addResult('标志性POI', 'POI覆盖', 'PASS', '主要POI已覆盖', { found: foundPois, total: examples.length });
        log(`    ✅ 找到主要POI: ${foundPois.join(', ')}`, 'green');
        log(`    总POI数量: ${examples.length}`, 'green');
      } else {
        addResult('标志性POI', 'POI覆盖', 'WARN', '部分主要POI缺失', { found: foundPois, expected: expectedPois });
        log(`    ⚠️  找到POI: ${foundPois.join(', ')}, 期望: ${expectedPois.join(', ')}`, 'yellow');
      }
    } else {
      addResult('标志性POI', '数据完整性', 'WARN', '缺少标志性POI数据');
      log('    ⚠️  缺少标志性POI数据', 'yellow');
    }

    console.log('');

    // 6. RouteTemplate验证
    log('【6. RouteTemplate验证】', 'cyan');
    const templates = rd.RouteTemplate || [];
    
    if (templates.length > 0) {
      addResult('RouteTemplate', '存在性', 'PASS', 'RouteTemplate存在', { count: templates.length });
      log(`    ✅ 找到 ${templates.length} 个RouteTemplate`, 'green');
      
      const template = templates[0];
      const dayPlans = template.dayPlans as any;
      
      if (dayPlans && Array.isArray(dayPlans)) {
        log(`    天数: ${dayPlans.length}天`, 'green');
        
        // 验证每天都有POI
        const daysWithPois = dayPlans.filter((day: any) => day.pois && day.pois.length > 0);
        if (daysWithPois.length === dayPlans.length) {
          addResult('RouteTemplate', 'POI完整性', 'PASS', '每天都有POI', { days: dayPlans.length });
          log(`    ✅ 每天都有POI`, 'green');
        } else {
          addResult('RouteTemplate', 'POI完整性', 'WARN', '部分天数缺少POI', { 
            total: dayPlans.length, 
            withPois: daysWithPois.length 
          });
          log(`    ⚠️  ${daysWithPois.length}/${dayPlans.length} 天有POI`, 'yellow');
        }

        // 验证关键POI存在
        const allPois = dayPlans.flatMap((day: any) => day.pois || []).map((p: any) => p.nameCN || p.nameEN);
        const keyPois = ['Landmannalaugar', 'Þórsmörk', 'Askja'];
        const foundKeyPois = keyPois.filter(poi => 
          allPois.some((name: string) => name && name.includes(poi))
        );
        
        if (foundKeyPois.length >= 2) {
          addResult('RouteTemplate', '关键POI', 'PASS', '关键POI已包含', { found: foundKeyPois });
          log(`    ✅ 关键POI: ${foundKeyPois.join(', ')}`, 'green');
        } else {
          addResult('RouteTemplate', '关键POI', 'WARN', '部分关键POI缺失', { found: foundKeyPois, expected: keyPois });
          log(`    ⚠️  关键POI: ${foundKeyPois.join(', ')}, 期望: ${keyPois.join(', ')}`, 'yellow');
        }
      }
    } else {
      addResult('RouteTemplate', '存在性', 'WARN', '缺少RouteTemplate');
      log('    ⚠️  缺少RouteTemplate', 'yellow');
    }

    console.log('');

    // 7. 与实际数据一致性验证
    log('【7. 与实际数据一致性验证】', 'cyan');
    
    // 7.1 检查道路状态数据
    log('  7.1 道路状态数据...', 'yellow');
    const roadStatusPath = path.join(process.cwd(), 'data', 'physical-reality', 'road-status', 'iceland-road-status.json');
    if (fs.existsSync(roadStatusPath)) {
      const roadStatusData = JSON.parse(fs.readFileSync(roadStatusPath, 'utf-8'));
      const fRoads = roadStatusData.roads?.filter((r: any) => r.roadId?.startsWith('F')) || [];
      const expectedFRoads = ['F208', 'F26', 'F35', 'F225', 'F249'];
      const foundFRoads = expectedFRoads.filter(road => 
        fRoads.some((r: any) => r.roadId === road)
      );
      
      if (foundFRoads.length >= 3) {
        addResult('数据一致性', '道路状态', 'PASS', '主要F路存在于道路状态数据', { found: foundFRoads });
        log(`    ✅ 找到F路: ${foundFRoads.join(', ')}`, 'green');
      } else {
        addResult('数据一致性', '道路状态', 'WARN', '部分F路未在道路状态数据中找到', { found: foundFRoads, expected: expectedFRoads });
        log(`    ⚠️  找到F路: ${foundFRoads.join(', ')}, 期望: ${expectedFRoads.join(', ')}`, 'yellow');
      }
    } else {
      addResult('数据一致性', '道路状态', 'WARN', '道路状态数据文件不存在');
      log('    ⚠️  道路状态数据文件不存在', 'yellow');
    }

    // 7.2 检查metadata中的philosophy
    log('  7.2 路线哲学检查...', 'yellow');
    const metadata = rd.metadata as any;
    if (metadata) {
      // 检查是否有philosophy相关信息
      const hasPhilosophy = metadata.philosophy || metadata.coreStatement;
      if (!hasPhilosophy) {
        addResult('数据完整性', '路线哲学', 'WARN', 'metadata中缺少philosophy字段');
        log('    ⚠️  metadata中缺少philosophy字段', 'yellow');
        log('    建议: 添加RoutePhilosophy到metadata.philosophy', 'yellow');
      } else {
        addResult('数据完整性', '路线哲学', 'PASS', '路线哲学存在', hasPhilosophy);
        log('    ✅ 路线哲学存在', 'green');
      }
    }

    console.log('');

    // 8. 总结
    log('='.repeat(80), 'cyan');
    log('验证总结', 'bright');
    log('='.repeat(80), 'cyan');
    
    const passCount = results.filter(r => r.status === 'PASS').length;
    const warnCount = results.filter(r => r.status === 'WARN').length;
    const failCount = results.filter(r => r.status === 'FAIL').length;
    
    log(`总计: ${results.length} 项检查`, 'cyan');
    log(`✅ 通过: ${passCount}`, 'green');
    log(`⚠️  警告: ${warnCount}`, warnCount > 0 ? 'yellow' : 'green');
    log(`❌ 失败: ${failCount}`, failCount > 0 ? 'red' : 'green');
    console.log('');

    // 详细结果
    log('详细结果:', 'cyan');
    results.forEach(r => {
      const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️' : '❌';
      const color = r.status === 'PASS' ? 'green' : r.status === 'WARN' ? 'yellow' : 'red';
      log(`  ${icon} [${r.category}] ${r.field}: ${r.message}`, color);
      if (r.details) {
        log(`     详情: ${JSON.stringify(r.details)}`, 'blue');
      }
    });

    console.log('');

    // 生成JSON报告
    const reportPath = path.join(process.cwd(), 'scripts', 'highlands-froad-validation-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      routeDirectionUuid: HIGHLANDS_FROAD_UUID,
      timestamp: new Date().toISOString(),
      summary: {
        total: results.length,
        pass: passCount,
        warn: warnCount,
        fail: failCount,
      },
      results,
    }, null, 2));
    log(`📄 详细报告已保存: ${reportPath}`, 'cyan');

  } catch (error: any) {
    log(`❌ 测试失败: ${error.message}`, 'red');
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
