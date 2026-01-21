#!/bin/bash

# 验证 Claude API 迁移脚本

echo "=========================================="
echo "验证规划工作台 Claude API 迁移"
echo "=========================================="
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 检查 OPENAI 引用
echo -e "${BLUE}检查是否还有 OPENAI 引用...${NC}"
openai_count=$(grep -r "LlmProvider.OPENAI" src/skills/plan/ 2>/dev/null | wc -l)
if [ "$openai_count" -eq 0 ]; then
  echo -e "${GREEN}✅ 没有找到 OPENAI 引用${NC}"
else
  echo -e "${RED}❌ 找到 $openai_count 个 OPENAI 引用${NC}"
  grep -r "LlmProvider.OPENAI" src/skills/plan/ 2>/dev/null
fi
echo ""

# 检查 ANTHROPIC 引用
echo -e "${BLUE}检查 ANTHROPIC 引用...${NC}"
anthropic_count=$(grep -r "LlmProvider.ANTHROPIC" src/skills/plan/ 2>/dev/null | wc -l)
echo -e "${GREEN}找到 $anthropic_count 个 ANTHROPIC 引用${NC}"
if [ "$anthropic_count" -ge 9 ]; then
  echo -e "${GREEN}✅ 所有规划技能文件已迁移${NC}"
else
  echo -e "${YELLOW}⚠️  期望找到 9 个文件，实际找到 $anthropic_count 个${NC}"
fi
echo ""

# 列出所有使用 ANTHROPIC 的文件
echo -e "${BLUE}使用 ANTHROPIC 的文件列表:${NC}"
grep -r "LlmProvider.ANTHROPIC" src/skills/plan/ 2>/dev/null | cut -d: -f1 | sort -u
echo ""

# 检查编译错误
echo -e "${BLUE}检查 TypeScript 编译状态...${NC}"
if [ -f "dist/src/skills/plan/architect/plan-architect-generate-skeleton.js" ]; then
  echo -e "${GREEN}✅ 代码已编译${NC}"
else
  echo -e "${YELLOW}⚠️  代码未编译，运行 npm run build${NC}"
fi
echo ""

# 检查环境变量
echo -e "${BLUE}检查环境变量配置...${NC}"
if [ -f ".env" ]; then
  if grep -q "ANTHROPIC_API_KEY" .env 2>/dev/null; then
    echo -e "${GREEN}✅ 找到 ANTHROPIC_API_KEY 配置${NC}"
  else
    echo -e "${YELLOW}⚠️  未找到 ANTHROPIC_API_KEY 配置${NC}"
  fi
else
  echo -e "${YELLOW}⚠️  未找到 .env 文件${NC}"
fi
echo ""

# 总结
echo "=========================================="
echo "验证总结"
echo "=========================================="
if [ "$openai_count" -eq 0 ] && [ "$anthropic_count" -ge 9 ]; then
  echo -e "${GREEN}✅ 迁移验证通过！${NC}"
  echo ""
  echo "下一步："
  echo "1. 确保服务器已重启（npm run dev）"
  echo "2. 运行测试：npm run test:planning-workbench-claude"
  echo "3. 检查服务器日志，确认使用 Anthropic API"
  exit 0
else
  echo -e "${RED}❌ 迁移验证未通过${NC}"
  exit 1
fi
