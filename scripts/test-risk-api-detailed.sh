#!/bin/bash
# 详细测试风险预警接口

TRIP_ID="${1:-7034ff65-e05d-4c04-ba7f-e1073eb12b59}"
BASE_URL="http://localhost:3000/api"

echo "=================================================================================="
echo "风险预警接口详细测试"
echo "=================================================================================="
echo ""
echo "行程ID: $TRIP_ID"
echo "接口: GET $BASE_URL/readiness/risk-warnings"
echo ""

# 测试1: 基本请求
echo "【测试1】基本请求（中文）"
echo "----------------------------------------------------------------------------------"
RESPONSE=$(curl -s "$BASE_URL/readiness/risk-warnings?tripId=$TRIP_ID&lang=zh")
if echo "$RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); exit(0 if data.get('success') else 1)" 2>/dev/null; then
    echo "✅ 请求成功"
    RISK_COUNT=$(echo "$RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(len(data.get('data', {}).get('risks', [])))" 2>/dev/null)
    echo "   风险数量: $RISK_COUNT"
else
    echo "❌ 请求失败"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null | head -20
    exit 1
fi
echo ""

# 测试2: 验证增强字段
echo "【测试2】验证增强字段"
echo "----------------------------------------------------------------------------------"
echo "$RESPONSE" | python3 << 'PYTHON'
import sys
import json

data = json.load(sys.stdin)
risks = data.get('data', {}).get('risks', [])

if not risks:
    print("❌ 无风险数据")
    sys.exit(1)

risk = risks[0]
required_fields = {
    'typeLabel': '类型标签',
    'typeLabelEn': '类型标签(英文)',
    'category': '分类',
    'typeIcon': '图标',
    'severityLabel': '严重程度标签',
    'description': '描述',
    'impact': '影响说明',
    'affectedPois': '影响的POI'
}

print("字段验证:")
all_passed = True
for field, name in required_fields.items():
    if field == 'affectedPois':
        exists = isinstance(risk.get(field), list)
    else:
        exists = bool(risk.get(field))
    status = "✅" if exists else "❌"
    print(f"  {status} {name}: {risk.get(field, 'N/A')}")
    if not exists:
        all_passed = False

if all_passed:
    print("\n✅ 所有增强字段验证通过！")
else:
    print("\n❌ 部分字段缺失")
    sys.exit(1)
PYTHON

# 测试3: 验证分类统计
echo ""
echo "【测试3】验证分类统计"
echo "----------------------------------------------------------------------------------"
echo "$RESPONSE" | python3 << 'PYTHON'
import sys
import json

data = json.load(sys.stdin)
summary = data.get('data', {}).get('summary', {})
by_category = summary.get('byCategory', {})

print("按分类统计:")
categories = ['weather', 'terrain', 'safety', 'logistics', 'other']
for cat in categories:
    count = by_category.get(cat, 0)
    print(f"  - {cat}: {count}")

if by_category:
    print("\n✅ 分类统计正常")
else:
    print("\n❌ 分类统计缺失")
PYTHON

# 测试4: 验证分组
echo ""
echo "【测试4】验证按分类分组"
echo "----------------------------------------------------------------------------------"
echo "$RESPONSE" | python3 << 'PYTHON'
import sys
import json

data = json.load(sys.stdin)
risks_by_category = data.get('data', {}).get('risksByCategory', {})

if risks_by_category:
    print("按分类分组:")
    for category, risks in risks_by_category.items():
        if risks:
            print(f"  - {category}: {len(risks)} 个风险")
    print("\n✅ 分组功能正常")
else:
    print("❌ 分组数据缺失")
PYTHON

# 测试5: 显示风险详情
echo ""
echo "【测试5】风险详情展示"
echo "----------------------------------------------------------------------------------"
echo "$RESPONSE" | python3 << 'PYTHON'
import sys
import json

data = json.load(sys.stdin)
risks = data.get('data', {}).get('risks', [])

print("前3个风险详情:")
for i, risk in enumerate(risks[:3], 1):
    print(f"\n  {i}. {risk.get('typeIcon', '⚠️')} {risk.get('typeLabel', risk.get('type'))} ({risk.get('severityLabel', risk.get('severity'))})")
    print(f"     分类: {risk.get('category', 'N/A')}")
    print(f"     描述: {risk.get('description', 'N/A')}")
    if risk.get('affectedPois'):
        print(f"     影响的POI: {len(risk.get('affectedPois', []))} 个")
PYTHON

echo ""
echo "=================================================================================="
echo "✅ 所有测试完成！"
echo "=================================================================================="
