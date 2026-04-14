#!/bin/bash

# scripts/security-scan.sh
#
# 依赖安全扫描脚本
#
# 用途：
# - 扫描 npm 依赖中的已知漏洞
# - 生成详细的安全报告
# - 在 CI/CD 中自动运行
# - 阻止部署含有高危/严重漏洞的代码
#
# 使用方式：
# - npm run security:scan
# - chmod +x scripts/security-scan.sh && ./scripts/security-scan.sh
#
# 退出码（本地始终 0；CI 且 CI=true 时）：
# - 0: 无 high/critical（moderate/low 不失败）
# - 1: 存在 high 或 critical

set -e

echo "========================================"
echo "TripNARA 依赖安全扫描"
echo "========================================"
echo ""

# jq 不是所有环境都保证存在：提供 Node.js 解析降级
has_jq() {
  command -v jq >/dev/null 2>&1
}

json_get() {
  local file="$1"
  local path="$2"
  if has_jq; then
    cat "$file" | jq -r "$path"
  else
    node -e "
      const fs=require('fs');
      const obj=JSON.parse(fs.readFileSync('${file}','utf8'));
      const expr='${path}'.split('||')[0].trim(); // only support simple '... // 0'
      const p=expr.replace(/^\\./,'').split('.').filter(Boolean);
      let cur=obj;
      for (const k of p) cur = (cur && Object.prototype.hasOwnProperty.call(cur,k)) ? cur[k] : undefined;
      if (cur === undefined || cur === null) process.stdout.write('0');
      else process.stdout.write(String(cur));
    "
  fi
}

# 颜色输出
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# 创建报告目录
REPORT_DIR="security-reports"
mkdir -p "$REPORT_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="$REPORT_DIR/audit-report-$TIMESTAMP.json"
SUMMARY_FILE="$REPORT_DIR/audit-summary-$TIMESTAMP.txt"

echo "📊 正在扫描依赖漏洞..."
echo ""

# 运行 npm audit 并保存结果
npm audit --json > "$REPORT_FILE" 2>&1 || true

# 解析漏洞统计
INFO=$(json_get "$REPORT_FILE" '.metadata.vulnerabilities.info // 0')
LOW=$(json_get "$REPORT_FILE" '.metadata.vulnerabilities.low // 0')
MODERATE=$(json_get "$REPORT_FILE" '.metadata.vulnerabilities.moderate // 0')
HIGH=$(json_get "$REPORT_FILE" '.metadata.vulnerabilities.high // 0')
CRITICAL=$(json_get "$REPORT_FILE" '.metadata.vulnerabilities.critical // 0')
TOTAL=$(json_get "$REPORT_FILE" '.metadata.vulnerabilities.total // 0')

# 生成摘要报告
{
  echo "========================================"
  echo "TripNARA 依赖安全扫描报告"
  echo "========================================"
  echo ""
  echo "扫描时间: $(date)"
  echo "Node 版本: $(node --version)"
  echo "NPM 版本: $(npm --version)"
  echo ""
  echo "漏洞统计:"
  echo "  Critical (严重): $CRITICAL"
  echo "  High (高危):     $HIGH"
  echo "  Moderate (中危): $MODERATE"
  echo "  Low (低危):      $LOW"
  echo "  Info (信息):     $INFO"
  echo "  -------------------------"
  echo "  Total (总计):    $TOTAL"
  echo ""
} > "$SUMMARY_FILE"

# 输出摘要到终端
cat "$SUMMARY_FILE"

# CI：存在 high 或 critical 即失败；本地：仅警告并以 0 退出（不阻断开发）
if [ "$CRITICAL" -gt 0 ] || [ "$HIGH" -gt 0 ]; then
  echo ""
  if [ "$CRITICAL" -gt 0 ] && [ "$HIGH" -gt 0 ]; then
    echo "⚠️  发现严重漏洞 ($CRITICAL) 与高危漏洞 ($HIGH)"
  elif [ "$CRITICAL" -gt 0 ]; then
    echo "⚠️  发现严重漏洞 ($CRITICAL)"
  else
    echo "⚠️  发现高危漏洞 ($HIGH)"
  fi
  echo ""
  echo "详细信息:"
  echo "----------------------------------------"

  if has_jq; then
    cat "$REPORT_FILE" | jq -r '
      .vulnerabilities |
      to_entries[] |
      select(.value.severity == "high" or .value.severity == "critical") |
      "\(.key) (\(.value.severity)): \(.value.via | if type == "array" then map(if type == "string" then . else .title end) | join(", ") else . end)"
    ' | head -40
  else
    REPORT_FILE="$REPORT_FILE" node - <<'NODE'
const fs = require('fs');
const reportPath = process.env.REPORT_FILE;
const r = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const vulns = r.vulnerabilities || {};
const entries = Object.entries(vulns).filter(([, v]) => v && (v.severity === 'high' || v.severity === 'critical'));
for (const [name, v] of entries.slice(0, 40)) {
  const via = (Array.isArray(v.via) ? v.via : v.via ? [v.via] : [])
    .map((x) => (typeof x === 'string' ? x : x.title || x.source || x.name || 'advisory'))
    .join(', ');
  console.log(`${name} (${v.severity}): ${via}`);
}
NODE
  fi

  echo "----------------------------------------"
  echo ""
  echo "💡 修复建议:"
  echo "  1. 运行: npm audit fix"
  echo "  2. 如果有 breaking changes: npm audit fix --force"
  echo "  3. 手动升级: npm update <package-name>"
  echo "  4. 查看详细报告: cat $REPORT_FILE"
  echo ""

  if [ "$CI" = "true" ]; then
    {
      echo ""
      echo "🚨 状态: FAILED - CI 要求清零 high/critical"
      echo ""
      echo "修复建议:"
      echo "  npm audit fix"
    } >> "$SUMMARY_FILE"
    echo -e "${RED}❌ 安全扫描失败 (CI): Critical=$CRITICAL High=$HIGH${NC}"
    echo ""
    echo "详细报告已保存:"
    echo "  - JSON 报告: $REPORT_FILE"
    echo "  - 摘要报告: $SUMMARY_FILE"
    echo ""
    echo "CI=true detected, exiting with error code 1"
    exit 1
  fi

  {
    echo ""
    echo "⚠️  状态: WARNING - 存在高危或严重漏洞（本地不阻断）"
    echo ""
    echo "修复建议: npm audit fix"
  } >> "$SUMMARY_FILE"
  echo -e "${YELLOW}⚠️  警告: 本地不阻止继续；推送到 CI 时 high/critical 会导致流水线失败${NC}"
  echo ""
  echo "详细报告已保存:"
  echo "  - JSON 报告: $REPORT_FILE"
  echo "  - 摘要报告: $SUMMARY_FILE"
  echo ""
  exit 0
fi

# 如果有中危或低危漏洞,警告但不失败
if [ "$MODERATE" -gt 0 ] || [ "$LOW" -gt 0 ]; then
  echo ""
  echo -e "${YELLOW}⚠️  发现中危或低危漏洞 (不阻止部署)${NC}"
  echo ""

  {
    echo ""
    echo "⚠️  状态: WARNING - 发现中危或低危漏洞"
    echo ""
    echo "建议: 尽快修复这些漏洞"
  } >> "$SUMMARY_FILE"
fi

# 如果没有漏洞
if [ "$TOTAL" -eq 0 ]; then
  echo ""
  echo -e "${GREEN}✅ 安全扫描通过: 未发现已知漏洞${NC}"
  echo ""

  {
    echo ""
    echo "✅ 状态: PASSED - 未发现已知漏洞"
  } >> "$SUMMARY_FILE"
fi

echo "详细报告已保存:"
echo "  - JSON 报告: $REPORT_FILE"
echo "  - 摘要报告: $SUMMARY_FILE"
echo ""

exit 0
