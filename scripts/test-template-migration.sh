#!/bin/bash

# 测试路线模板迁移工具
# 使用方法: ./scripts/test-template-migration.sh [templateId]

set -e

TEMPLATE_ID=${1:-36}
BASE_URL="http://localhost:3000"

echo "🧪 测试路线模板迁移工具"
echo "=========================="
echo ""

# 1. 检查服务器是否运行
echo "1️⃣  检查服务器状态..."
if ! curl -s "${BASE_URL}/api/system/status" > /dev/null 2>&1; then
    echo "❌ 服务器未运行，请先启动服务器: npm run dev"
    exit 1
fi
echo "✅ 服务器运行正常"
echo ""

# 2. 检查模板迁移状态
echo "2️⃣  检查模板 ${TEMPLATE_ID} 的迁移状态..."
MIGRATION_STATUS=$(curl -s "${BASE_URL}/api/route-directions/templates/${TEMPLATE_ID}/migration-status")
echo "$MIGRATION_STATUS" | python3 -m json.tool 2>/dev/null || echo "$MIGRATION_STATUS"
echo ""

# 3. 查看模板当前数据
echo "3️⃣  查看模板 ${TEMPLATE_ID} 的当前数据..."
TEMPLATE_DATA=$(curl -s "${BASE_URL}/api/route-directions/templates/${TEMPLATE_ID}")
echo "$TEMPLATE_DATA" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data.get('success'):
    template = data['data']
    print(f\"模板名称: {template.get('nameCN') or template.get('name') or 'Unnamed'}\")
    print(f\"天数: {template.get('durationDays', 0)}\")
    dayPlans = template.get('dayPlans', [])
    print(f\"每日计划数: {len(dayPlans)}\")
    for i, plan in enumerate(dayPlans[:3]):  # 只显示前3天
        day = plan.get('day', i+1)
        requiredNodes = plan.get('requiredNodes', [])
        pois = plan.get('pois', [])
        print(f\"  第{day}天: requiredNodes={len(requiredNodes)}, pois={len(pois)}\")
else:
    print('❌ 获取模板数据失败')
" 2>/dev/null || echo "$TEMPLATE_DATA"
echo ""

# 4. 提示下一步操作
echo "4️⃣  下一步操作："
echo ""
echo "   如果模板需要迁移，可以运行："
echo "   npx ts-node scripts/migrate-route-template-to-pois.ts ${TEMPLATE_ID} --dry-run"
echo ""
echo "   确认无误后执行实际迁移："
echo "   npx ts-node scripts/migrate-route-template-to-pois.ts ${TEMPLATE_ID}"
echo ""
