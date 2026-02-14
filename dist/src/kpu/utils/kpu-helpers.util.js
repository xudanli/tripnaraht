"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatValidationResult = formatValidationResult;
exports.filterHighQualityResults = filterHighQualityResults;
exports.sortByValidationScore = sortByValidationScore;
exports.calculateValidationStats = calculateValidationStats;
exports.isValidationPassed = isValidationPassed;
exports.getValidationSummary = getValidationSummary;
function formatValidationResult(result) {
    const lines = [];
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
function filterHighQualityResults(results, minScore = 0.7) {
    return results.filter(r => r.validation.overallScore >= minScore);
}
function sortByValidationScore(results, ascending = false) {
    return [...results].sort((a, b) => {
        const scoreA = a.validation.overallScore;
        const scoreB = b.validation.overallScore;
        return ascending ? scoreA - scoreB : scoreB - scoreA;
    });
}
function calculateValidationStats(results) {
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
function isValidationPassed(result) {
    return result.overall === 'pass' && result.score >= 80;
}
function getValidationSummary(result) {
    const issues = [];
    const recommendations = [];
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
    if (result.score < 60) {
        recommendations.push('验证得分较低，建议检查知识源质量');
        recommendations.push('建议启用更多验证选项');
    }
    else if (result.score < 80) {
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
//# sourceMappingURL=kpu-helpers.util.js.map