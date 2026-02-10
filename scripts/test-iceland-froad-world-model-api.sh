#!/bin/bash
# 通过 API 测试冰岛 F 路世界模型
# 使用方法: ./scripts/test-iceland-froad-world-model-api.sh

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}测试冰岛 F 路世界模型（通过 API）${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}📍 API地址: ${API_BASE_URL}${NC}"
echo ""

# 1. 查找冰岛 F 路相关的 RouteDirection
echo -e "${CYAN}步骤 1: 查找冰岛 F 路 RouteDirection...${NC}"
ROUTE_DIRECTIONS=$(curl -s "${API_BASE_URL}/api/route-directions?countryCode=IS&month=7&limit=10")
echo "$ROUTE_DIRECTIONS" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    routes = data.get('data', {}).get('active', []) or data.get('data', [])
    print(f'找到 {len(routes)} 个路线方向')
    for route in routes[:5]:
        name = route.get('nameCN') or route.get('name', '未知')
        uuid = route.get('uuid') or route.get('id', '未知')
        tags = ', '.join(route.get('tags', [])[:3])
        print(f\"  - {name} (UUID: {uuid})\")
        print(f\"    标签: {tags}\")
        if 'F' in name or 'froad' in name.lower() or 'highland' in name.lower():
            print(f\"    ⭐ 可能是 F 路路线\")
except:
    print('无法解析响应')
" 2>/dev/null || echo "无法解析路线方向数据"

echo ""

# 2. 获取冰岛道路状态（F路）
echo -e "${CYAN}步骤 2: 获取冰岛 F 路道路状态...${NC}"
ROAD_STATUS=$(curl -s "${API_BASE_URL}/api/iceland-info/road-conditions?fRoads=F208,F26,F35")
echo "$ROAD_STATUS" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    roads = data.get('data', []) or data.get('roads', [])
    print(f'找到 {len(roads)} 条 F 路状态')
    for road in roads[:5]:
        name = road.get('name') or road.get('fRoadNumber', '未知')
        status = road.get('status', 'unknown')
        is_open = road.get('isOpen', False)
        print(f\"  - {name}: ${status} (${'开放' if is_open else '关闭'})\")
except Exception as e:
    print(f'无法解析道路状态: {e}')
" 2>/dev/null || echo "无法解析道路状态数据"

echo ""

# 3. 读取物理现实数据文件
echo -e "${CYAN}步骤 3: 读取物理现实数据文件...${NC}"
if [ -f "data/physical-reality/road-status/iceland-road-status.json" ]; then
    echo "✅ 找到道路状态文件"
    python3 << 'EOF'
import json
with open('data/physical-reality/road-status/iceland-road-status.json', 'r') as f:
    data = json.load(f)
    roads = data.get('roads', [])
    print(f"道路数量: {len(roads)}")
    
    f_roads = [r for r in roads if r.get('roadType') == 'F-road']
    print(f"F 路数量: {len(f_roads)}")
    
    print("\nF 路列表:")
    for road in f_roads[:5]:
        print(f"  - {road.get('roadId')}: {road.get('roadName')}")
        print(f"    状态: {road.get('status')} (当前: {road.get('currentStatus')})")
        if road.get('season'):
            months = road['season'].get('openMonths', [])
            print(f"    开放月份: {months}")
        if road.get('requirements'):
            req = road['requirements']
            print(f"    车辆要求: {req.get('vehicleType', '未知')}")
            print(f"    经验要求: {req.get('experience', '未知')}")
EOF
else
    echo -e "${RED}❌ 未找到道路状态文件${NC}"
fi

echo ""

# 4. 读取天气窗口数据
echo -e "${CYAN}步骤 4: 读取天气窗口数据...${NC}"
if [ -f "data/physical-reality/weather-windows/iceland-weather-windows.json" ]; then
    echo "✅ 找到天气窗口文件"
    python3 << 'EOF'
import json
with open('data/physical-reality/weather-windows/iceland-weather-windows.json', 'r') as f:
    data = json.load(f)
    windows = data.get('windows', [])
    print(f"天气窗口数量: {len(windows)}")
    
    # 查找7月的天气窗口
    july_windows = [w for w in windows if w.get('month') == 7]
    if july_windows:
        print("\n7月天气窗口:")
        for win in july_windows[:3]:
            print(f"  - {win.get('region', '未知区域')}")
            print(f"    可达性评分: {win.get('accessibilityScore', 0)}")
            if win.get('typicalWeather'):
                weather = win['typicalWeather']
                print(f"    典型天气: 风速 {weather.get('windSpeedMps', 0)} m/s, "
                      f"降水 {weather.get('precipitationMmPerHour', 0)} mm/h")
EOF
else
    echo -e "${RED}❌ 未找到天气窗口文件${NC}"
fi

echo ""

# 5. 读取渡轮时刻表
echo -e "${CYAN}步骤 5: 读取渡轮时刻表...${NC}"
if [ -f "data/physical-reality/ferry-schedules/iceland-ferry-schedules.json" ]; then
    echo "✅ 找到渡轮时刻表文件"
    python3 << 'EOF'
import json
with open('data/physical-reality/ferry-schedules/iceland-ferry-schedules.json', 'r') as f:
    data = json.load(f)
    ferries = data.get('ferries', [])
    print(f"渡轮路线数量: {len(ferries)}")
    
    for ferry in ferries[:3]:
        print(f"  - {ferry.get('routeName', '未知路线')}")
        print(f"    状态: {ferry.get('status', '未知')}")
        if ferry.get('season'):
            months = ferry['season'].get('openMonths', [])
            print(f"    运行月份: {months}")
EOF
else
    echo -e "${RED}❌ 未找到渡轮时刻表文件${NC}"
fi

echo ""

# 6. 总结
echo -e "${BLUE}========================================${NC}"
echo -e "${CYAN}世界模型数据来源总结${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "PhysicalRealityModel 数据来源:"
echo "  ✅ 道路状态: data/physical-reality/road-status/iceland-road-status.json"
echo "  ✅ 天气窗口: data/physical-reality/weather-windows/iceland-weather-windows.json"
echo "  ✅ 渡轮时刻表: data/physical-reality/ferry-schedules/iceland-ferry-schedules.json"
echo ""
echo "HumanCapabilityModel 数据来源:"
echo "  - 从用户画像生成（fitness, pace, riskTolerance）"
echo ""
echo "RouteDirection 数据来源:"
echo "  - 从 RouteDirection 表查询"
echo "  - 路线哲学: src/trips/decision/models/route-philosophy.model.ts"
echo ""
echo -e "${GREEN}测试完成${NC}"
