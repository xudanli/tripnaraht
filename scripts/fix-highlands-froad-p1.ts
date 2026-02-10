#!/usr/bin/env npx tsx
/**
 * 修复内陆高地F路 RouteDirection - P1项
 * 
 * 1. 添加failureProfile（失败画像）
 * 2. 添加narrative（路线叙事）
 * 3. 添加antiPersona（不适合的用户画像）
 */

import { PrismaClient } from '@prisma/client';
import { FailureProfile, RouteNarrative } from '../src/route-directions/interfaces/route-direction.interface';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

const HIGHLANDS_FROAD_UUID = '8afd4b2e-7dd1-4837-8169-d3efed748138';

// 失败画像
const FAILURE_PROFILE: FailureProfile = {
  commonFailureDays: [3, 4],
  // 注意：typicalFailureReason只允许特定值：'fatigue' | 'weather' | 'altitude' | 'slope' | 'distance' | 'logistics'
  // 'river_crossing'和'vehicle_breakdown'映射到'logistics'
  typicalFailureReason: ['fatigue', 'weather', 'logistics'],
  rescueDifficulty: 'HIGH',
  failureScenarios: [
    {
      day: 3,
      reason: 'Sprengisandur (F26) 河流穿越失败 - 冰川河流水位过高或车辆陷入（logistics）',
      typicalUserProfile: '缺乏F路驾驶经验的用户，未充分了解河流穿越技巧',
      mitigation: '建议跟随有经验的向导或参加F路穿越团，携带拖车绳和卫星通信设备',
    },
    {
      day: 4,
      reason: 'Askja火山区域天气突变 - 强风、降雪导致能见度为零（weather）',
      typicalUserProfile: '未充分准备应对极端天气的用户',
      mitigation: '必须携带GPS设备，随时关注天气预报，准备在hut中等待天气好转',
    },
    {
      day: 2,
      reason: 'Þórsmörk山谷河流穿越困难 - F225/F249路况恶劣（logistics）',
      typicalUserProfile: '车辆不适合或驾驶技术不足的用户',
      mitigation: '确保使用改装四驱车，了解河流深度和流速，避免单独穿越',
    },
  ],
};

// 路线叙事
const NARRATIVE: RouteNarrative = {
  internal: '这条路线假设用户愿意为极致荒野体验牺牲城市便利，接受高风险和高不确定性。用户必须理解F路的极端性，具备基本的户外应急能力，并愿意在必要时调整计划。',
  userFacing: '这是一条以极致荒野体验为主线的F路穿越路线，而不是舒适的城市打卡路线。你将穿越冰岛最荒凉的高地，体验完全无人区的原始自然，但同时也需要面对极端路况、天气变化和救援困难。这条路线适合有丰富四驱车驾驶经验和户外应急能力的探险者。',
  philosophy: '从文明进入高地，再回到人间 - 这是一次从现代文明到原始荒野的穿越，是对自然极限的挑战，也是对自我的超越。',
};

// 不适合的用户画像
const ANTI_PERSONA = [
  '低风险偏好',
  '无四驱车驾驶经验',
  '时间极度紧张（少于5天）',
  '不愿接受不确定性',
  '无户外应急经验',
  '无卫星通信设备',
  '车辆不适合F路（非四驱SUV）',
  '不愿在极端天气下等待',
  '希望舒适便利的旅行体验',
  '无河流穿越经验',
];

async function main() {
  log('='.repeat(80), 'cyan');
  log('修复内陆高地F路 RouteDirection - P1项', 'bright');
  log('='.repeat(80), 'cyan');
  console.log('');

  const prisma = new PrismaClient();

  try {
    // 1. 获取当前RouteDirection
    log('步骤 1: 获取RouteDirection数据...', 'cyan');
    const rd = await prisma.routeDirection.findFirst({
      where: { uuid: HIGHLANDS_FROAD_UUID },
    });

    if (!rd) {
      log(`❌ RouteDirection不存在: ${HIGHLANDS_FROAD_UUID}`, 'red');
      process.exit(1);
    }

    log(`✅ 找到RouteDirection: ${rd.nameCN} (ID: ${rd.id})`, 'green');
    console.log('');

    // 2. 准备更新数据
    log('步骤 2: 准备更新数据...', 'cyan');
    
    const currentMetadata = (rd.metadata as any) || {};
    const updatedMetadata = {
      ...currentMetadata,
      // 保留已有的philosophy
      philosophy: currentMetadata.philosophy,
      // 添加扩展字段
      extensions: {
        ...(currentMetadata.extensions || {}),
        failureProfile: FAILURE_PROFILE,
        narrative: NARRATIVE,
      },
      // 添加antiPersona到metadata根级别（便于查询）
      antiPersona: ANTI_PERSONA,
    };

    log('  ✅ FailureProfile数据已准备', 'green');
    log(`    常见失败日期: 第${FAILURE_PROFILE.commonFailureDays.join('、')}天`, 'green');
    log(`    失败场景数: ${FAILURE_PROFILE.failureScenarios?.length || 0}个`, 'green');
    
    log('  ✅ Narrative数据已准备', 'green');
    log(`    内部叙事: ${NARRATIVE.internal.substring(0, 50)}...`, 'green');
    
    log('  ✅ AntiPersona数据已准备', 'green');
    log(`    不适合用户画像: ${ANTI_PERSONA.length}条`, 'green');
    console.log('');

    // 3. 执行更新
    log('步骤 3: 执行数据库更新...', 'cyan');
    
    await prisma.routeDirection.update({
      where: { id: rd.id },
      data: {
        metadata: updatedMetadata,
        updatedAt: new Date(),
      },
    });
    
    log(`  ✅ 已更新metadata（添加failureProfile, narrative, antiPersona）`, 'green');
    console.log('');

    // 4. 验证更新结果
    log('步骤 4: 验证更新结果...', 'cyan');
    const updatedRd = await prisma.routeDirection.findFirst({
      where: { uuid: HIGHLANDS_FROAD_UUID },
    });
    
    if (updatedRd) {
      const metadata = updatedRd.metadata as any;
      const hasFailureProfile = metadata?.extensions?.failureProfile;
      const hasNarrative = metadata?.extensions?.narrative;
      const hasAntiPersona = metadata?.antiPersona && Array.isArray(metadata.antiPersona);
      
      log(`  ✅ RouteDirection更新成功`, 'green');
      log(`    FailureProfile: ${hasFailureProfile ? '✅ 已添加' : '❌ 缺失'}`, hasFailureProfile ? 'green' : 'red');
      log(`    Narrative: ${hasNarrative ? '✅ 已添加' : '❌ 缺失'}`, hasNarrative ? 'green' : 'red');
      log(`    AntiPersona: ${hasAntiPersona ? '✅ 已添加' : '❌ 缺失'}`, hasAntiPersona ? 'green' : 'red');
      
      if (hasFailureProfile) {
        log(`    失败场景数: ${metadata.extensions.failureProfile.failureScenarios?.length || 0}`, 'green');
        log(`    救援难度: ${metadata.extensions.failureProfile.rescueDifficulty}`, 'green');
      }
      
      if (hasNarrative) {
        log(`    用户面向叙事: ${metadata.extensions.narrative.userFacing.substring(0, 60)}...`, 'green');
      }
      
      if (hasAntiPersona) {
        log(`    不适合用户画像数: ${metadata.antiPersona.length}`, 'green');
      }
    }
    
    console.log('');
    log('='.repeat(80), 'cyan');
    log('修复完成！', 'bright');
    log('='.repeat(80), 'cyan');
    log('', 'reset');
    log('📝 下一步:', 'cyan');
    log('  1. 运行验证脚本确认所有改进项', 'yellow');
    log('  2. 测试Neptune决策策略是否能正确读取failureProfile', 'yellow');
    log('  3. 验证antiPersona是否在路线推荐时正确过滤', 'yellow');

  } catch (error: any) {
    log(`❌ 修复失败: ${error.message}`, 'red');
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
