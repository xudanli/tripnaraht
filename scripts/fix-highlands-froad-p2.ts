#!/usr/bin/env npx tsx
/**
 * 修复内陆高地F路 RouteDirection - P2项（可选优化）
 * 
 * 1. 规范化metadata结构
 * 2. 统一signaturePois格式
 * 3. 验证数据库索引
 */

import { PrismaClient } from '@prisma/client';

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

async function main() {
  log('='.repeat(80), 'cyan');
  log('修复内陆高地F路 RouteDirection - P2项（可选优化）', 'bright');
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

    // 2. 规范化metadata结构
    log('步骤 2: 规范化metadata结构...', 'cyan');
    
    const currentMetadata = (rd.metadata as any) || {};
    
    // 规范化后的metadata结构
    const normalizedMetadata = {
      // 基础信息
      version: currentMetadata.version || '1.0.0',
      route_id: currentMetadata.route_id || 'route_006',
      last_updated: new Date().toISOString().split('T')[0],
      credibility_score: currentMetadata.credibility_score || 0.91,
      
      // 核心字段（已存在）
      philosophy: currentMetadata.philosophy,
      
      // 扩展字段
      extensions: {
        failureProfile: currentMetadata.extensions?.failureProfile,
        narrative: currentMetadata.extensions?.narrative,
      },
      
      // 用户画像
      antiPersona: currentMetadata.antiPersona || [],
    };

    log('  ✅ Metadata结构已规范化', 'green');
    log(`    版本: ${normalizedMetadata.version}`, 'green');
    log(`    最后更新: ${normalizedMetadata.last_updated}`, 'green');
    console.log('');

    // 3. 统一signaturePois格式
    log('步骤 3: 统一signaturePois格式...', 'cyan');
    
    const currentSignaturePois = (rd.signaturePois as any) || {};
    const examples = currentSignaturePois.examples || [];
    
    // 规范化signaturePois：统一为对象格式
    const normalizedSignaturePois = {
      count: currentSignaturePois.count || examples.length,
      examples: examples.map((ex: any, index: number) => {
        // 如果已经是对象，直接返回
        if (typeof ex === 'object' && ex !== null && !Array.isArray(ex)) {
          return {
            name: ex.name || `POI ${index + 1}`,
            nameCN: ex.nameCN,
            nameEN: ex.nameEN,
            uuid: ex.uuid,
            id: ex.id,
            category: ex.category,
            ...ex,
          };
        }
        
        // 如果是数字ID，查询POI信息
        if (typeof ex === 'number') {
          return {
            id: ex,
            // 注意：这里不查询数据库，保持ID引用
            // 实际使用时可以通过ID查询完整信息
          };
        }
        
        // 如果是字符串，作为名称
        if (typeof ex === 'string') {
          return {
            name: ex,
          };
        }
        
        return ex;
      }),
      // 保留其他字段
      types: currentSignaturePois.types,
      weights: currentSignaturePois.weights,
    };

    log('  ✅ SignaturePois格式已统一', 'green');
    log(`    POI数量: ${normalizedSignaturePois.count}`, 'green');
    log(`    示例格式: ${normalizedSignaturePois.examples.length > 0 ? '对象数组' : '空'}`, 'green');
    console.log('');

    // 4. 验证数据库索引
    log('步骤 4: 验证数据库索引...', 'cyan');
    
    const indexChecks = await prisma.$queryRawUnsafe(`
      SELECT 
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'RouteDirection'
        AND schemaname = 'public'
      ORDER BY indexname;
    `) as Array<{ indexname: string; indexdef: string }>;
    
    log(`  找到 ${indexChecks.length} 个索引:`, 'green');
    indexChecks.forEach(idx => {
      log(`    - ${idx.indexname}`, 'green');
    });
    
    // 检查关键索引是否存在
    const hasCountryStatusIndex = indexChecks.some(idx => 
      idx.indexname.includes('country') && idx.indexname.includes('status')
    );
    const hasTagsIndex = indexChecks.some(idx => 
      idx.indexname.includes('tags') || idx.indexdef.includes('GIN')
    );
    
    if (hasCountryStatusIndex && hasTagsIndex) {
      log('  ✅ 关键索引存在', 'green');
    } else {
      log('  ⚠️  部分关键索引可能缺失', 'yellow');
      if (!hasCountryStatusIndex) {
        log('    建议添加: (countryCode, status) 复合索引', 'yellow');
      }
      if (!hasTagsIndex) {
        log('    建议添加: tags GIN索引', 'yellow');
      }
    }
    
    console.log('');

    // 5. 执行更新
    log('步骤 5: 执行数据库更新...', 'cyan');
    
    await prisma.routeDirection.update({
      where: { id: rd.id },
      data: {
        metadata: normalizedMetadata,
        signaturePois: normalizedSignaturePois,
        updatedAt: new Date(),
      },
    });
    
    log(`  ✅ 已更新metadata和signaturePois`, 'green');
    console.log('');

    // 6. 验证更新结果
    log('步骤 6: 验证更新结果...', 'cyan');
    const updatedRd = await prisma.routeDirection.findFirst({
      where: { uuid: HIGHLANDS_FROAD_UUID },
    });
    
    if (updatedRd) {
      const metadata = updatedRd.metadata as any;
      const signaturePois = updatedRd.signaturePois as any;
      
      log(`  ✅ RouteDirection更新成功`, 'green');
      log(`    Metadata版本: ${metadata?.version || 'N/A'}`, 'green');
      log(`    SignaturePois格式: ${Array.isArray(signaturePois?.examples) ? '对象数组' : '其他'}`, 'green');
      log(`    SignaturePois数量: ${signaturePois?.count || signaturePois?.examples?.length || 0}`, 'green');
    }
    
    console.log('');
    log('='.repeat(80), 'cyan');
    log('P2项优化完成！', 'bright');
    log('='.repeat(80), 'cyan');
    log('', 'reset');
    log('📝 总结:', 'cyan');
    log('  ✅ Metadata结构已规范化', 'green');
    log('  ✅ SignaturePois格式已统一', 'green');
    log('  ✅ 数据库索引已验证', 'green');
    log('', 'reset');
    log('📝 下一步:', 'cyan');
    log('  1. 运行完整验证脚本确认所有改进', 'yellow');
    log('  2. 测试RouteDirection查询性能', 'yellow');
    log('  3. 验证signaturePois格式是否被正确使用', 'yellow');

  } catch (error: any) {
    log(`❌ 优化失败: ${error.message}`, 'red');
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
