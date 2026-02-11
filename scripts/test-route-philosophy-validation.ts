#!/usr/bin/env npx tsx
/**
 * 路线哲学模型验证测试脚本
 * 
 * 测试所有 RouteDirection Fixtures 的哲学模型和验证逻辑
 */

import { 
  ALL_ROUTE_DIRECTION_FIXTURES,
  validateReplacementAgainstPhilosophy,
  checkCoreExperienceCoverage,
  RoutePhilosophy,
} from '../src/route-directions/fixtures';

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

function logSection(title: string) {
  log(`\n${'='.repeat(60)}`, 'blue');
  log(title, 'bright');
  log('='.repeat(60), 'blue');
}

function logSuccess(message: string) {
  log(`✅ ${message}`, 'green');
}

function logError(message: string) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message: string) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message: string) {
  log(`ℹ️  ${message}`, 'cyan');
}

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

/**
 * 测试1: 验证所有 fixture 都有完整的哲学模型
 */
function testPhilosophyCompleteness() {
  logSection('测试1: 哲学模型完整性');
  
  ALL_ROUTE_DIRECTION_FIXTURES.forEach((fixture) => {
    const testName = `${fixture.nameCN} - 哲学模型完整`;
    const philosophy = fixture.philosophy;
    
    if (!philosophy) {
      logError(`${fixture.nameCN}: 缺少哲学模型`);
      results.push({ name: testName, passed: false, details: '缺少 philosophy 字段' });
      return;
    }
    
    if (typeof philosophy === 'string') {
      logWarning(`${fixture.nameCN}: 哲学模型是字符串，建议升级为对象`);
      results.push({ name: testName, passed: true, details: '是字符串格式' });
      return;
    }
    
    const missing: string[] = [];
    if (!philosophy.coreStatement) missing.push('coreStatement');
    if (!philosophy.nonNegotiableRules?.length) missing.push('nonNegotiableRules');
    if (!philosophy.flexibleParts?.length) missing.push('flexibleParts');
    
    if (missing.length > 0) {
      logWarning(`${fixture.nameCN}: 缺少字段 ${missing.join(', ')}`);
      results.push({ name: testName, passed: false, details: `缺少: ${missing.join(', ')}` });
    } else {
      logSuccess(`${fixture.nameCN}: 哲学模型完整`);
      logInfo(`  核心陈述: "${philosophy.coreStatement}"`);
      logInfo(`  必须体验: ${philosophy.mustVisitTags?.join(', ') || '(无)'}`);
      logInfo(`  不可协商规则: ${philosophy.nonNegotiableRules.length} 条`);
      logInfo(`  可灵活调整: ${philosophy.flexibleParts.length} 项`);
      results.push({ name: testName, passed: true });
    }
  });
}

/**
 * 测试2: 验证失败画像配置
 */
function testFailureProfileCompleteness() {
  logSection('测试2: 失败画像完整性');
  
  ALL_ROUTE_DIRECTION_FIXTURES.forEach((fixture) => {
    const testName = `${fixture.nameCN} - 失败画像完整`;
    const fp = fixture.failureProfile;
    
    if (!fp) {
      logError(`${fixture.nameCN}: 缺少失败画像`);
      results.push({ name: testName, passed: false, details: '缺少 failureProfile' });
      return;
    }
    
    const missing: string[] = [];
    if (!fp.commonFailureDays?.length) missing.push('commonFailureDays');
    if (!fp.typicalFailureReason?.length) missing.push('typicalFailureReason');
    if (!fp.rescueDifficulty) missing.push('rescueDifficulty');
    
    if (missing.length > 0) {
      logWarning(`${fixture.nameCN}: 失败画像缺少 ${missing.join(', ')}`);
      results.push({ name: testName, passed: false, details: `缺少: ${missing.join(', ')}` });
    } else {
      logSuccess(`${fixture.nameCN}: 失败画像完整`);
      logInfo(`  常见失败日: ${fp.commonFailureDays.join(', ')}`);
      logInfo(`  失败原因: ${fp.typicalFailureReason.join(', ')}`);
      logInfo(`  救援难度: ${fp.rescueDifficulty}`);
      logInfo(`  失败场景: ${fp.failureScenarios?.length || 0} 个`);
      results.push({ name: testName, passed: true });
    }
  });
}

/**
 * 测试3: 核心体验覆盖验证功能
 */
function testCoreExperienceCoverage() {
  logSection('测试3: 核心体验覆盖验证');
  
  ALL_ROUTE_DIRECTION_FIXTURES.forEach((fixture) => {
    const philosophy = fixture.philosophy as RoutePhilosophy;
    if (!philosophy || typeof philosophy === 'string') {
      return;
    }
    
    const mustVisitTags = philosophy.mustVisitTags || [];
    if (mustVisitTags.length === 0) {
      logInfo(`${fixture.nameCN}: 无必须体验标签，跳过测试`);
      return;
    }
    
    // 测试完全覆盖
    const testName1 = `${fixture.nameCN} - 完全覆盖`;
    const fullCoverage = checkCoreExperienceCoverage([...mustVisitTags, '额外标签'], philosophy);
    if (fullCoverage.covered) {
      logSuccess(`${fixture.nameCN}: 完全覆盖验证通过`);
      results.push({ name: testName1, passed: true });
    } else {
      logError(`${fixture.nameCN}: 完全覆盖验证失败`);
      results.push({ name: testName1, passed: false, details: `缺少: ${fullCoverage.missingTags.join(', ')}` });
    }
    
    // 测试部分覆盖
    const testName2 = `${fixture.nameCN} - 部分覆盖检测`;
    const partialCoverage = checkCoreExperienceCoverage([mustVisitTags[0]], philosophy);
    if (!partialCoverage.covered && partialCoverage.missingTags.length > 0) {
      logSuccess(`${fixture.nameCN}: 部分覆盖检测正确，缺少: ${partialCoverage.missingTags.join(', ')}`);
      results.push({ name: testName2, passed: true });
    } else {
      logError(`${fixture.nameCN}: 部分覆盖检测异常`);
      results.push({ name: testName2, passed: false });
    }
  });
}

/**
 * 测试4: 替换验证功能
 */
function testReplacementValidation() {
  logSection('测试4: 替换验证功能');
  
  ALL_ROUTE_DIRECTION_FIXTURES.forEach((fixture) => {
    const philosophy = fixture.philosophy as RoutePhilosophy;
    if (!philosophy || typeof philosophy === 'string') {
      return;
    }
    
    const mustVisitTags = philosophy.mustVisitTags || [];
    if (mustVisitTags.length === 0) {
      return;
    }
    
    // 测试删除必须体验（应该被拒绝）
    const testName1 = `${fixture.nameCN} - 阻止删除必须体验`;
    const result1 = validateReplacementAgainstPhilosophy(
      { type: 'POI_REPLACEMENT', removedTags: [mustVisitTags[0]] },
      philosophy
    );
    
    if (!result1.allowed && result1.violations.length > 0) {
      logSuccess(`${fixture.nameCN}: 正确阻止删除 "${mustVisitTags[0]}"`);
      logInfo(`  违规: ${result1.violations[0]}`);
      results.push({ name: testName1, passed: true });
    } else {
      logError(`${fixture.nameCN}: 未能阻止删除必须体验`);
      results.push({ name: testName1, passed: false });
    }
    
    // 测试删除非必须体验（应该被允许）
    const testName2 = `${fixture.nameCN} - 允许删除非必须体验`;
    const result2 = validateReplacementAgainstPhilosophy(
      { type: 'POI_REPLACEMENT', removedTags: ['非必须体验'] },
      philosophy
    );
    
    if (result2.allowed) {
      logSuccess(`${fixture.nameCN}: 正确允许删除非必须体验`);
      results.push({ name: testName2, passed: true });
    } else {
      logError(`${fixture.nameCN}: 错误阻止了非必须体验的删除`);
      results.push({ name: testName2, passed: false });
    }
  });
}

/**
 * 测试5: metadata 中的哲学模型一致性
 */
function testMetadataConsistency() {
  logSection('测试5: Metadata 一致性');
  
  ALL_ROUTE_DIRECTION_FIXTURES.forEach((fixture) => {
    const testName = `${fixture.nameCN} - Metadata 哲学一致`;
    const topLevelPhilosophy = fixture.philosophy as RoutePhilosophy;
    const metadataPhilosophy = fixture.metadata?.philosophy as RoutePhilosophy;
    
    if (!topLevelPhilosophy || typeof topLevelPhilosophy === 'string') {
      logWarning(`${fixture.nameCN}: 顶层哲学模型不是对象`);
      results.push({ name: testName, passed: true, details: '跳过' });
      return;
    }
    
    if (!metadataPhilosophy) {
      logWarning(`${fixture.nameCN}: metadata 中缺少哲学模型（可选）`);
      results.push({ name: testName, passed: true, details: 'metadata 无哲学模型' });
      return;
    }
    
    if (topLevelPhilosophy.coreStatement === metadataPhilosophy.coreStatement) {
      logSuccess(`${fixture.nameCN}: 顶层和 metadata 哲学一致`);
      results.push({ name: testName, passed: true });
    } else {
      logError(`${fixture.nameCN}: 顶层和 metadata 哲学不一致`);
      results.push({ name: testName, passed: false });
    }
  });
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  log('\n' + '🧪'.repeat(30), 'blue');
  log('路线哲学模型验证测试', 'bright');
  log('🧪'.repeat(30), 'blue');
  
  testPhilosophyCompleteness();
  testFailureProfileCompleteness();
  testCoreExperienceCoverage();
  testReplacementValidation();
  testMetadataConsistency();
  
  // 汇总结果
  logSection('测试结果汇总');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  
  log(`\n总计: ${total} 个测试`, 'cyan');
  log(`✅ 通过: ${passed}`, 'green');
  if (failed > 0) {
    log(`❌ 失败: ${failed}`, 'red');
    log('\n失败的测试:', 'red');
    results.filter(r => !r.passed).forEach(r => {
      log(`  - ${r.name}${r.details ? `: ${r.details}` : ''}`, 'red');
    });
  }
  
  const successRate = ((passed / total) * 100).toFixed(1);
  log(`\n成功率: ${successRate}%`, passed === total ? 'green' : 'yellow');
  
  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(console.error);
