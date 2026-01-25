#!/bin/bash

# RAG 架构数据库迁移脚本
# 用途：一键执行数据库迁移和验证
# 日期：2026-01-24

set -e  # 遇到错误立即退出

echo "============================================================"
echo "TripNARA RAG 架构 - 数据库迁移脚本"
echo "============================================================"
echo ""

# ========================================
# 1. 环境检查
# ========================================

echo "📋 Step 1: 检查环境..."

# 检查 .env 文件
if [ ! -f .env ]; then
  echo "❌ 错误: .env 文件不存在"
  echo "   请先创建 .env 文件并配置数据库连接"
  exit 1
fi

# 加载环境变量
export $(cat .env | grep -v '^#' | xargs)

# 检查数据库配置
if [ -z "$DATABASE_URL" ]; then
  echo "❌ 错误: DATABASE_URL 未配置"
  echo "   请在 .env 文件中添加 DATABASE_URL"
  exit 1
fi

# 从 DATABASE_URL 提取数据库信息
# 格式: postgresql://user:password@host:port/database
DB_USER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')

echo "✓ 数据库配置:"
echo "  - 主机: $DB_HOST:$DB_PORT"
echo "  - 数据库: $DB_NAME"
echo "  - 用户: $DB_USER"
echo ""

# 检查 PostgreSQL 客户端
if ! command -v psql &> /dev/null; then
  echo "❌ 错误: psql 命令未找到"
  echo "   请先安装 PostgreSQL 客户端"
  exit 1
fi

echo "✓ psql 客户端已安装"
echo ""

# ========================================
# 2. 数据库连接测试
# ========================================

echo "📡 Step 2: 测试数据库连接..."

if psql "$DATABASE_URL" -c "SELECT version();" > /dev/null 2>&1; then
  echo "✓ 数据库连接成功"
  echo ""
else
  echo "❌ 错误: 无法连接到数据库"
  echo "   请检查数据库是否运行，以及 DATABASE_URL 配置是否正确"
  exit 1
fi

# ========================================
# 3. 备份数据库（重要！）
# ========================================

echo "💾 Step 3: 备份当前数据库..."

BACKUP_DIR="./backups"
mkdir -p $BACKUP_DIR

BACKUP_FILE="$BACKUP_DIR/tripnara_backup_$(date +%Y%m%d_%H%M%S).sql"

echo "  备份文件: $BACKUP_FILE"

if pg_dump "$DATABASE_URL" > "$BACKUP_FILE"; then
  echo "✓ 数据库备份成功"
  echo "  如果迁移失败，可以使用以下命令恢复:"
  echo "  psql \"$DATABASE_URL\" < $BACKUP_FILE"
  echo ""
else
  echo "❌ 错误: 数据库备份失败"
  echo "   是否继续迁移？(y/N)"
  read -r response
  if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo "迁移已取消"
    exit 1
  fi
fi

# ========================================
# 4. 执行 SQL 迁移
# ========================================

echo "🔧 Step 4: 执行 SQL 迁移..."

MIGRATION_FILE="prisma/migrations/add_decision_logs_and_knowledge_gaps.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ 错误: 迁移文件不存在: $MIGRATION_FILE"
  exit 1
fi

echo "  迁移文件: $MIGRATION_FILE"
echo ""

if psql "$DATABASE_URL" -f "$MIGRATION_FILE"; then
  echo ""
  echo "✓ SQL 迁移执行成功"
  echo ""
else
  echo ""
  echo "❌ 错误: SQL 迁移失败"
  echo "   请检查日志并使用备份恢复数据库:"
  echo "   psql \"$DATABASE_URL\" < $BACKUP_FILE"
  exit 1
fi

# ========================================
# 5. 验证迁移结果
# ========================================

echo "✅ Step 5: 验证迁移结果..."

# 检查表是否存在
check_table() {
  local table_name=$1
  if psql "$DATABASE_URL" -tAc "SELECT to_regclass('public.$table_name');" | grep -q "$table_name"; then
    echo "  ✓ 表 '$table_name' 创建成功"
    return 0
  else
    echo "  ✗ 表 '$table_name' 创建失败"
    return 1
  fi
}

# 检查字段是否存在
check_column() {
  local table_name=$1
  local column_name=$2
  if psql "$DATABASE_URL" -tAc "SELECT column_name FROM information_schema.columns WHERE table_name='$table_name' AND column_name='$column_name';" | grep -q "$column_name"; then
    echo "  ✓ 字段 '$table_name.$column_name' 添加成功"
    return 0
  else
    echo "  ✗ 字段 '$table_name.$column_name' 添加失败"
    return 1
  fi
}

# 检查视图是否存在
check_view() {
  local view_name=$1
  if psql "$DATABASE_URL" -tAc "SELECT to_regclass('public.$view_name');" | grep -q "$view_name"; then
    echo "  ✓ 视图 '$view_name' 创建成功"
    return 0
  else
    echo "  ✗ 视图 '$view_name' 创建失败"
    return 1
  fi
}

echo ""
echo "检查表结构..."
check_table "decision_logs"
check_table "knowledge_gaps"

echo ""
echo "检查字段..."
check_column "chunks" "category"
check_column "chunks" "last_verified_at"

echo ""
echo "检查视图..."
check_view "v_gate_decision_stats"
check_view "v_knowledge_gap_stats"
check_view "v_chunks_freshness_stats"

echo ""

# ========================================
# 6. 更新 Prisma Client
# ========================================

echo "🔄 Step 6: 更新 Prisma Client..."

# 检查是否需要手动更新 schema.prisma
echo ""
echo "⚠️  重要提示："
echo "   请手动将 prisma/schema-extensions-rag.prisma 中的模型定义"
echo "   复制到 prisma/schema.prisma 文件中"
echo ""
echo "   是否已经完成？(y/N)"
read -r schema_updated

if [[ ! "$schema_updated" =~ ^[Yy]$ ]]; then
  echo ""
  echo "⏸️  请先更新 schema.prisma，然后重新运行此脚本"
  echo "   或手动执行: npx prisma generate"
  exit 0
fi

echo ""
echo "生成 Prisma Client..."

if npx prisma generate; then
  echo "✓ Prisma Client 生成成功"
  echo ""
else
  echo "❌ 错误: Prisma Client 生成失败"
  echo "   请检查 schema.prisma 文件是否正确"
  exit 1
fi

# ========================================
# 7. 运行类型检查
# ========================================

echo "🔍 Step 7: 运行类型检查..."

if npm run typecheck; then
  echo "✓ 类型检查通过"
  echo ""
else
  echo "⚠️  类型检查失败，但迁移已完成"
  echo "   请修复类型错误后再运行应用"
  echo ""
fi

# ========================================
# 8. 验证查询
# ========================================

echo "📊 Step 8: 运行验证查询..."

echo ""
echo "统计视图数据:"
echo "----------------------------------------"

echo ""
echo "1. Gate 决策统计 (v_gate_decision_stats):"
psql "$DATABASE_URL" -c "SELECT * FROM v_gate_decision_stats LIMIT 5;" || echo "  (当前无数据)"

echo ""
echo "2. 知识缺口统计 (v_knowledge_gap_stats):"
psql "$DATABASE_URL" -c "SELECT * FROM v_knowledge_gap_stats;" || echo "  (当前无数据)"

echo ""
echo "3. 数据新鲜度统计 (v_chunks_freshness_stats):"
psql "$DATABASE_URL" -c "SELECT * FROM v_chunks_freshness_stats;" || echo "  (当前无数据)"

echo ""
echo "4. Chunks 分类统计:"
psql "$DATABASE_URL" -c "SELECT category, COUNT(*) as count FROM chunks WHERE category IS NOT NULL GROUP BY category ORDER BY category;" || echo "  (当前无数据)"

echo ""

# ========================================
# 9. 完成总结
# ========================================

echo "============================================================"
echo "✅ 迁移完成总结"
echo "============================================================"
echo ""
echo "已完成:"
echo "  ✓ 数据库备份: $BACKUP_FILE"
echo "  ✓ SQL 迁移执行"
echo "  ✓ 表结构验证"
echo "  ✓ Prisma Client 生成"
echo ""
echo "下一步:"
echo "  1. 运行示例脚本验证服务:"
echo "     npx tsx scripts/example-rag-usage.ts"
echo ""
echo "  2. 查看快速开始指南:"
echo "     cat docs/RAG_QUICK_START.md"
echo ""
echo "  3. 开始使用新服务:"
echo "     - RagFallbackService (降级策略)"
echo "     - GateDecisionLoggerService (决策日志)"
echo "     - RagFreshnessService (数据新鲜度)"
echo ""
echo "文档:"
echo "  - docs/RAG_ARCHITECTURE_EVALUATION.md"
echo "  - docs/RAG_IMPLEMENTATION_GUIDE.md"
echo "  - docs/RAG_QUICK_START.md"
echo "  - docs/RAG_DEPLOYMENT_CHECKLIST.md"
echo ""
echo "如有问题，请查看备份文件: $BACKUP_FILE"
echo "============================================================"
echo ""
