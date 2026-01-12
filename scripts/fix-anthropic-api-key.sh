#!/bin/bash

# 修复 Anthropic API Key 配置脚本

ENV_FILE="${1:-.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ 文件不存在: $ENV_FILE"
  exit 1
fi

echo "=========================================="
echo "修复 Anthropic API Key 配置"
echo "=========================================="
echo ""

# 备份
cp "$ENV_FILE" "${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
echo "✅ 已备份到: ${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
echo ""

# 检查当前配置
echo "当前配置:"
grep -E "^ANTHROPIC_API_KEY" "$ENV_FILE" | head -1
echo ""

# 提取 API Key（移除引号和空格）
API_KEY=$(grep -E "^ANTHROPIC_API_KEY" "$ENV_FILE" | head -1 | sed 's/ANTHROPIC_API_KEY=//' | sed 's/"//g' | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//')

if [ -z "$API_KEY" ]; then
  echo "❌ 未找到 ANTHROPIC_API_KEY"
  exit 1
fi

echo "提取的 API Key (前 20 字符): ${API_KEY:0:20}..."
echo ""

# 检查格式
if [[ "$API_KEY" =~ ^sk-ant-api03- ]]; then
  echo "✅ API Key 格式正确 (sk-ant-api03-...)"
elif [[ "$API_KEY" =~ ^sk-ant- ]]; then
  echo "⚠️  API Key 格式可能是旧版本 (sk-ant-...)"
elif [[ "$API_KEY" =~ ^sk_ ]]; then
  echo "❌ 警告: API Key 格式看起来像 OpenAI (sk_...)，不是 Anthropic 格式"
  echo "   正确的 Anthropic API Key 应该以 'sk-ant-api03-' 开头"
  echo ""
  read -p "是否继续修复（移除引号）？(y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消"
    exit 1
  fi
else
  echo "⚠️  无法识别 API Key 格式"
fi
echo ""

# 修复：移除引号和多余空格
echo "修复配置..."
sed -i.tmp 's/^ANTHROPIC_API_KEY=.*/ANTHROPIC_API_KEY='"$API_KEY"'/' "$ENV_FILE"
rm -f "${ENV_FILE}.tmp"

echo "✅ 已修复"
echo ""

# 验证修复结果
echo "修复后的配置:"
grep -E "^ANTHROPIC_API_KEY" "$ENV_FILE" | head -1
echo ""

echo "=========================================="
echo "下一步"
echo "=========================================="
echo ""
echo "1. 验证 API Key 格式是否正确（应该以 sk-ant-api03- 开头）"
echo "2. 如果格式不对，请从 Anthropic 控制台获取正确的 API Key"
echo "3. 重启服务使配置生效："
echo "   docker restart tripnara-app"
echo "   或"
echo "   npm run dev"
echo ""
