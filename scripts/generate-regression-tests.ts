// scripts/generate-regression-tests.ts
/**
 * 自动生成回归用例框架
 * 
 * 为每个国家的 Pack 生成 10 条回归用例框架
 * 
 * 用法：
 *   npx ts-node --project tsconfig.backend.json scripts/generate-regression-tests.ts <pack-file>
 * 
 * 示例：
 *   npx ts-node --project tsconfig.backend.json scripts/generate-regression-tests.ts data/country-packs/country-pack-is.json
 */

import * as fs from 'fs';
import * as path from 'path';

interface CountryPackSkeleton {
  countryCode: string;
  countryName: string;
  routeDirections: Array<{
    name: string;
    nameCN: string;
    tags?: string[];
  }>;
}

interface RegressionTestCase {
  name: string;
  description: string;
  input: {
    countryCode: string;
    month?: number;
    preferences?: string[];
    pace?: 'relaxed' | 'moderate' | 'intense';
    riskTolerance?: 'low' | 'medium' | 'high';
    durationDays?: number;
  };
  expected: {
    routeDirectionName?: string;
    routeDirectionTags?: string[];
    minPoiCount?: number;
    hasConstraints?: boolean;
    hasRiskProfile?: boolean;
  };
}

function generateRegressionTests(pack: CountryPackSkeleton): RegressionTestCase[] {
  const tests: RegressionTestCase[] = [];

  // 1. 基础测试：默认偏好
  tests.push({
    name: `基础测试 - ${pack.countryCode} 默认偏好`,
    description: `测试 ${pack.countryName} 的基础路线方向选择`,
    input: {
      countryCode: pack.countryCode,
      month: 7, // 夏季
      durationDays: 5,
    },
    expected: {
      minPoiCount: 10,
      hasConstraints: true,
      hasRiskProfile: true,
    },
  });

  // 2. 季节性测试：最佳月份
  tests.push({
    name: `季节性测试 - ${pack.countryCode} 最佳月份`,
    description: `测试 ${pack.countryName} 在最佳月份的选择`,
    input: {
      countryCode: pack.countryCode,
      month: 7, // 假设是夏季最佳
      preferences: ['自然', '摄影'],
      durationDays: 7,
    },
    expected: {
      routeDirectionTags: ['自然', '摄影'],
      hasConstraints: true,
    },
  });

  // 3. 季节性测试：禁忌月份
  tests.push({
    name: `季节性测试 - ${pack.countryCode} 禁忌月份`,
    description: `测试 ${pack.countryName} 在禁忌月份的选择（应该避免某些路线）`,
    input: {
      countryCode: pack.countryCode,
      month: 1, // 冬季
      preferences: ['户外'],
      durationDays: 5,
    },
    expected: {
      minPoiCount: 5,
    },
  });

  // 4. 节奏测试：轻松
  tests.push({
    name: `节奏测试 - ${pack.countryCode} 轻松节奏`,
    description: `测试 ${pack.countryName} 在轻松节奏下的选择`,
    input: {
      countryCode: pack.countryCode,
      month: 7,
      pace: 'relaxed',
      durationDays: 5,
    },
    expected: {
      minPoiCount: 8,
      hasConstraints: true,
    },
  });

  // 5. 节奏测试：挑战
  tests.push({
    name: `节奏测试 - ${pack.countryCode} 挑战节奏`,
    description: `测试 ${pack.countryName} 在挑战节奏下的选择`,
    input: {
      countryCode: pack.countryCode,
      month: 7,
      pace: 'intense',
      preferences: ['挑战', '徒步'],
      durationDays: 7,
    },
    expected: {
      routeDirectionTags: ['挑战', '徒步'],
      hasConstraints: true,
    },
  });

  // 6. 风险测试：低风险
  tests.push({
    name: `风险测试 - ${pack.countryCode} 低风险`,
    description: `测试 ${pack.countryName} 在低风险偏好下的选择`,
    input: {
      countryCode: pack.countryCode,
      month: 7,
      riskTolerance: 'low',
      durationDays: 5,
    },
    expected: {
      minPoiCount: 8,
      hasRiskProfile: true,
    },
  });

  // 7. 风险测试：高风险
  tests.push({
    name: `风险测试 - ${pack.countryCode} 高风险`,
    description: `测试 ${pack.countryName} 在高风险偏好下的选择`,
    input: {
      countryCode: pack.countryCode,
      month: 7,
      riskTolerance: 'high',
      preferences: ['挑战', '冒险'],
      durationDays: 7,
    },
    expected: {
      routeDirectionTags: ['挑战', '冒险'],
      hasRiskProfile: true,
    },
  });

  // 8. 偏好测试：文化
  tests.push({
    name: `偏好测试 - ${pack.countryCode} 文化偏好`,
    description: `测试 ${pack.countryName} 在文化偏好下的选择`,
    input: {
      countryCode: pack.countryCode,
      month: 7,
      preferences: ['文化', '历史', '博物馆'],
      durationDays: 5,
    },
    expected: {
      routeDirectionTags: ['文化', '历史'],
      minPoiCount: 8,
    },
  });

  // 9. 偏好测试：自然
  tests.push({
    name: `偏好测试 - ${pack.countryCode} 自然偏好`,
    description: `测试 ${pack.countryName} 在自然偏好下的选择`,
    input: {
      countryCode: pack.countryCode,
      month: 7,
      preferences: ['自然', '摄影', '户外'],
      durationDays: 7,
    },
    expected: {
      routeDirectionTags: ['自然', '摄影'],
      minPoiCount: 10,
    },
  });

  // 10. 综合测试：多条件组合
  tests.push({
    name: `综合测试 - ${pack.countryCode} 多条件组合`,
    description: `测试 ${pack.countryName} 在多个条件组合下的选择`,
    input: {
      countryCode: pack.countryCode,
      month: 7,
      preferences: ['自然', '摄影'],
      pace: 'moderate',
      riskTolerance: 'medium',
      durationDays: 7,
    },
    expected: {
      routeDirectionTags: ['自然', '摄影'],
      minPoiCount: 10,
      hasConstraints: true,
      hasRiskProfile: true,
    },
  });

  return tests;
}

function saveRegressionTests(tests: RegressionTestCase[], pack: CountryPackSkeleton, outputDir: string): void {
  const outputPath = path.join(
    outputDir,
    `regression-tests-${pack.countryCode.toLowerCase()}.json`
  );

  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 保存 JSON 文件
  fs.writeFileSync(
    outputPath,
    JSON.stringify(tests, null, 2),
    'utf-8'
  );

  console.log(`✅ 回归用例已生成: ${outputPath}`);
  console.log(`\n包含 ${tests.length} 条测试用例：`);
  tests.forEach((test, index) => {
    console.log(`  ${index + 1}. ${test.name}`);
  });
  console.log(`\n下一步：`);
  console.log(`  1. 将这些用例集成到 E2E 测试中`);
  console.log(`  2. 根据实际 RouteDirection 调整 expected 字段`);
  console.log(`  3. 运行测试验证 Pack 的正确性`);
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('用法: npx ts-node scripts/generate-regression-tests.ts <pack-file>');
    console.error('示例: npx ts-node scripts/generate-regression-tests.ts data/country-packs/country-pack-is.json');
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

    console.log(`为 ${pack.countryCode} (${pack.countryName}) 生成回归用例...`);

    const tests = generateRegressionTests(pack);
    const outputDir = path.join(__dirname, '../data/regression-tests');

    saveRegressionTests(tests, pack, outputDir);
  } catch (error: any) {
    console.error(`❌ 读取或解析文件失败: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

