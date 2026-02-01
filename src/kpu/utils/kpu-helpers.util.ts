// src/kpu/utils/kpu-helpers.util.ts
/**
 * KPU工具函数
 */

import { ValidatedRetrievalResult, OutputValidationResult } from '../types/validation.types';

/**
 * 格式化验证结果用于显示
 */
export function formatValidationResult(result: OutputValidationResult): string {
  const lines: string[] = [];

  lines.push(`验证结果: ${result.overall.toUpperCase()}`);
  lines.push(`得分: ${result.score}/100`);

  if (result.factChecks.length > 0) {
    lines.push('\n事实检查:');
    result.factChecks.forEach(check => {
      const status = check.passed ? '✓' : '✗';
      lines.push(`  ${status} ${check.description}: ${check.details}`);
    });
  }

  if (result.consistencyChecks.length > 0) {
    lines.push('\n一致性检查:');
    result.consistencyChecks.forEach(check => {
      const status = check.passed ? '✓' : '✗';
      lines.push(`  ${status} [${check.type}] ${check.details}`);
    });
  }

  if (result.warnings.length > 0) {
    lines.push('\n警告:');
    result.warnings.forEach(warning => {
      lines.push(`  ⚠ ${warning}`);
    });
  }

  if (result.citations.length > 0) {
    lines.push(`\n引用: ${result.citations.length} 个`);
  }

  return lines.join('\n');
}

/**
 * 筛选高质量知识片段
 */
export function filterHighQualityResults(
  results: ValidatedRetrievalResult[],
  minScore: number = 0.7
): ValidatedRetrievalResult[] {
  return results.filter(r => r.validation.overallScore >= minScore);
}

/**
 * 按验证得分排序
 */
export function sortByValidationScore(
  results: ValidatedRetrievalResult[],
  ascending: boolean = false
): ValidatedRetrievalResult[] {
  return [...results].sort((a, b) => {
    const scoreA = a.validation.overallScore;
    const scoreB = b.validation.overallScore;
    return ascending ? scoreA - scoreB : scoreB - scoreA;
  });
}

/**
 * 计算验证统计信息
 */
export function calculateValidationStats(results: ValidatedRetrievalResult[]) {
  if (results.length === 0) {
    return {
      total: 0,
      avgScore: 0,
      passCount: 0,
      failCount: 0,
      unknownCount: 0,
      highQualityCount: 0,
    };
  }

  const scores = results.map(r => r.validation.overallScore);
  const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

  const factChecks = results.map(r => r.validation.factCheck);
  const passCount = factChecks.filter(c => c === 'pass').length;
  const failCount = factChecks.filter(c => c === 'fail').length;
  const unknownCount = factChecks.filter(c => c === 'unknown').length;

  const highQualityCount = results.filter(r => r.validation.overallScore >= 0.7).length;

  return {
    total: results.length,
    avgScore: Math.round(avgScore * 100) / 100,
    passCount,
    failCount,
    unknownCount,
    highQualityCount,
    highQualityRate: Math.round((highQualityCount / results.length) * 100),
  };
}

/**
 * 检查验证结果是否通过
 */
export function isValidationPassed(result: OutputValidationResult): boolean {
  return result.overall === 'pass' && result.score >= 80;
}

/**
 * 获取验证结果摘要
 */
export function getValidationSummary(result: OutputValidationResult): {
  status: 'pass' | 'fail' | 'warning';
  score: number;
  issues: string[];
  recommendations: string[];
} {
  const issues: string[] = [];
  const recommendations: string[] = [];

  // 收集问题
  result.factChecks.forEach(check => {
    if (!check.passed) {
      issues.push(`事实错误: ${check.description}`);
    }
  });

  result.consistencyChecks.forEach(check => {
    if (!check.passed) {
      issues.push(`一致性问题: ${check.details}`);
    }
  });

  result.warnings.forEach(warning => {
    issues.push(`警告: ${warning}`);
  });

  // 生成建议
  if (result.score < 60) {
    recommendations.push('验证得分较低，建议检查知识源质量');
    recommendations.push('建议启用更多验证选项');
  } else if (result.score < 80) {
    recommendations.push('验证得分中等，建议优化知识源');
  }

  if (result.factChecks.some(c => !c.passed)) {
    recommendations.push('发现事实错误，建议更新知识源');
  }

  if (result.consistencyChecks.some(c => !c.passed)) {
    recommendations.push('发现一致性问题，建议检查知识源一致性');
  }

  return {
    status: result.overall,
    score: result.score,
    issues,
    recommendations,
  };
}
