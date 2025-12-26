// scripts/pack-validator.ts
/**
 * Pack 校验器
 * 
 * 检查 corridor/regions/signaturePois/thresholds 是否齐全
 * 
 * 用法：
 *   npx ts-node --project tsconfig.backend.json scripts/pack-validator.ts <pack-file>
 * 
 * 示例：
 *   npx ts-node --project tsconfig.backend.json scripts/pack-validator.ts data/country-packs/country-pack-is.json
 */

import * as fs from 'fs';
import * as path from 'path';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  missingFields: {
    routeDirections: Array<{
      name: string;
      missing: string[];
    }>;
  };
}

interface RouteDirectionSkeleton {
  name: string;
  nameCN: string;
  regions?: string[];
  entryHubs?: string[];
  constraints?: {
    hard?: any;
    soft?: any;
  };
  signaturePois?: {
    types?: string[];
    examples?: string[];
  };
  [key: string]: any;
}

interface CountryPackSkeleton {
  countryCode: string;
  countryName: string;
  routeDirections: RouteDirectionSkeleton[];
  regions?: string[];
  [key: string]: any;
}

function validatePack(pack: CountryPackSkeleton): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const missingFields: ValidationResult['missingFields'] = {
    routeDirections: [],
  };

  // 1. 检查基本字段
  if (!pack.countryCode) {
    errors.push('缺少 countryCode');
  }
  if (!pack.countryName) {
    errors.push('缺少 countryName');
  }
  if (!pack.routeDirections || pack.routeDirections.length === 0) {
    errors.push('缺少 routeDirections 或 routeDirections 为空');
  }

  // 2. 检查至少 3 条 RouteDirection
  if (pack.routeDirections && pack.routeDirections.length < 3) {
    warnings.push(`只有 ${pack.routeDirections.length} 条 RouteDirection，建议至少 3 条`);
  }

  // 3. 检查每条 RouteDirection
  if (pack.routeDirections) {
    for (const rd of pack.routeDirections) {
      const missing: string[] = [];

      // 必需字段
      if (!rd.name) missing.push('name');
      if (!rd.nameCN) missing.push('nameCN');
      if (!rd.tags || rd.tags.length === 0) missing.push('tags');

      // 重要字段（建议有）
      if (!rd.regions || rd.regions.length === 0) {
        missing.push('regions');
        warnings.push(`RouteDirection ${rd.name} 缺少 regions`);
      }
      if (!rd.entryHubs || rd.entryHubs.length === 0) {
        missing.push('entryHubs');
        warnings.push(`RouteDirection ${rd.name} 缺少 entryHubs`);
      }

      // 约束检查
      if (!rd.constraints) {
        missing.push('constraints');
        warnings.push(`RouteDirection ${rd.name} 缺少 constraints（建议至少定义 soft constraints）`);
      } else {
        if (!rd.constraints.soft && !rd.constraints.hard) {
          warnings.push(`RouteDirection ${rd.name} 的 constraints 为空`);
        }
        // 检查是否有阈值设置
        if (rd.constraints.soft) {
          if (!rd.constraints.soft.maxDailyAscentM && !rd.constraints.soft.maxElevationM) {
            warnings.push(`RouteDirection ${rd.name} 的 soft constraints 缺少阈值（maxDailyAscentM 或 maxElevationM）`);
          }
        }
      }

      // signaturePois 检查
      if (!rd.signaturePois) {
        missing.push('signaturePois');
        warnings.push(`RouteDirection ${rd.name} 缺少 signaturePois（建议至少定义 types）`);
      } else {
        if (!rd.signaturePois.types || rd.signaturePois.types.length === 0) {
          warnings.push(`RouteDirection ${rd.name} 的 signaturePois.types 为空`);
        }
      }

      // corridorGeom 检查（在 metadata 中）
      if (!rd.metadata?.corridorGeom && !rd.corridorGeom) {
        warnings.push(`RouteDirection ${rd.name} 缺少 corridorGeom（地理走廊，可在 metadata 中定义）`);
      }

      // seasonality 检查
      if (!rd.seasonality) {
        warnings.push(`RouteDirection ${rd.name} 缺少 seasonality（建议定义 bestMonths 和 avoidMonths）`);
      } else {
        if (!rd.seasonality.bestMonths || rd.seasonality.bestMonths.length === 0) {
          warnings.push(`RouteDirection ${rd.name} 的 seasonality.bestMonths 为空`);
        }
      }

      // riskProfile 检查
      if (!rd.riskProfile) {
        warnings.push(`RouteDirection ${rd.name} 缺少 riskProfile（建议定义风险画像）`);
      }

      if (missing.length > 0) {
        missingFields.routeDirections.push({
          name: rd.name,
          missing,
        });
      }
    }
  }

  // 4. 检查 regions 列表
  if (!pack.regions || pack.regions.length === 0) {
    warnings.push('缺少 regions 列表（建议定义国家的主要区域）');
  }

  // 5. 检查 policy
  if (!pack.policy) {
    warnings.push('缺少 policy 配置（建议定义默认 pace 和 riskTolerance）');
  }

  const isValid = errors.length === 0 && missingFields.routeDirections.length === 0;

  return {
    isValid,
    errors,
    warnings,
    missingFields,
  };
}

function generateReport(result: ValidationResult, packFile: string): void {
  console.log(`\n📋 Pack 校验报告: ${packFile}\n`);
  console.log('='.repeat(60));

  if (result.isValid) {
    console.log('✅ Pack 校验通过！');
  } else {
    console.log('❌ Pack 校验失败！');
  }

  if (result.errors.length > 0) {
    console.log(`\n❌ 错误 (${result.errors.length}):`);
    result.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error}`);
    });
  }

  if (result.warnings.length > 0) {
    console.log(`\n⚠️  警告 (${result.warnings.length}):`);
    result.warnings.forEach((warning, index) => {
      console.log(`  ${index + 1}. ${warning}`);
    });
  }

  if (result.missingFields.routeDirections.length > 0) {
    console.log(`\n📝 缺失字段:`);
    result.missingFields.routeDirections.forEach((rd) => {
      console.log(`  - ${rd.name}:`);
      rd.missing.forEach((field) => {
        console.log(`    • ${field}`);
      });
    });
  }

  console.log('\n' + '='.repeat(60));

  if (!result.isValid) {
    console.log('\n💡 修复建议:');
    console.log('  1. 补充所有必需字段（errors）');
    console.log('  2. 补充建议字段（warnings）');
    console.log('  3. 运行 pack-validator.ts 再次检查');
    process.exit(1);
  } else if (result.warnings.length > 0) {
    console.log('\n💡 建议:');
    console.log('  虽然校验通过，但建议补充警告中的字段以提高质量');
  } else {
    console.log('\n🎉 Pack 完整且质量良好！');
  }
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('用法: npx ts-node scripts/pack-validator.ts <pack-file>');
    console.error('示例: npx ts-node scripts/pack-validator.ts data/country-packs/country-pack-is.json');
    process.exit(1);
  }

  const packFile = args[0];
  const fullPath = path.isAbsolute(packFile) 
    ? packFile 
    : path.join(__dirname, '..', packFile);

  if (!fs.existsSync(fullPath)) {
    console.error(`❌ 文件不存在: ${fullPath}`);
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const pack: CountryPackSkeleton = JSON.parse(content);

    const result = validatePack(pack);
    generateReport(result, packFile);
  } catch (error: any) {
    console.error(`❌ 读取或解析文件失败: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

