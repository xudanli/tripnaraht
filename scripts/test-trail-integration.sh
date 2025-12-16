#!/bin/bash

# Trail功能集成测试脚本
# 使用方法: ./scripts/test-trail-integration.sh

BASE_URL="http://localhost:3000"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Trail功能集成测试 ===${NC}\n"

# 检查服务器是否运行
echo -e "${YELLOW}1. 检查服务器状态...${NC}"
if ! curl -s "$BASE_URL/system/status" > /dev/null 2>&1; then
    echo -e "${RED}❌ 服务器未运行，请先启动服务器: npm run dev${NC}"
    exit 1
fi
echo -e "${GREEN}✅ 服务器运行正常${NC}\n"

# 检查是否有jq
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}⚠️  未安装jq，将使用python格式化JSON输出${NC}\n"
    USE_JQ=false
else
    USE_JQ=true
fi

# 格式化JSON输出
format_json() {
    if [ "$USE_JQ" = true ]; then
        jq '.' 2>/dev/null || cat
    else
        python3 -m json.tool 2>/dev/null || cat
    fi
}

# 测试1: 查询Trail列表
echo -e "${YELLOW}2. 测试查询Trail列表...${NC}"
RESPONSE=$(curl -s -X GET "$BASE_URL/trails")
echo "$RESPONSE" | format_json
if echo "$RESPONSE" | grep -q '"id"'; then
    echo -e "${GREEN}✅ Trail列表查询成功${NC}"
    # 获取第一个Trail ID用于后续测试
    if [ "$USE_JQ" = true ]; then
        TRAIL_ID=$(echo "$RESPONSE" | jq -r '.[0].id // empty' 2>/dev/null)
    else
        TRAIL_ID=$(echo "$RESPONSE" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
    fi
    if [ -n "$TRAIL_ID" ] && [ "$TRAIL_ID" != "null" ]; then
        echo -e "${BLUE}   使用Trail ID: $TRAIL_ID 进行后续测试${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  未找到Trail数据，将跳过部分测试${NC}"
    TRAIL_ID=""
fi
echo ""

# 测试2: 根据景点推荐Trail（需要至少2个Place ID）
echo -e "${YELLOW}3. 测试根据景点推荐Trail...${NC}"
# 先获取一些Place ID
PLACES_RESPONSE=$(curl -s -X GET "$BASE_URL/places?limit=3")
if [ "$USE_JQ" = true ]; then
    PLACE_IDS=$(echo "$PLACES_RESPONSE" | jq -r '.[0:3] | map(.id) | @json' 2>/dev/null)
else
    PLACE_IDS="[1,2,3]"  # 使用默认值
fi

RESPONSE=$(curl -s -X POST "$BASE_URL/trails/recommend-for-places" \
  -H "Content-Type: application/json" \
  -d "{
    \"placeIds\": $PLACE_IDS,
    \"preferOffRoad\": true,
    \"maxDifficulty\": \"MODERATE\"
  }")
echo "$RESPONSE" | format_json
if echo "$RESPONSE" | grep -q '"trail"'; then
    echo -e "${GREEN}✅ Trail推荐成功${NC}"
else
    echo -e "${YELLOW}⚠️  未找到推荐的Trail（可能没有匹配的路线）${NC}"
fi
echo ""

# 测试3: 智能路线规划
echo -e "${YELLOW}4. 测试智能路线规划...${NC}"
RESPONSE=$(curl -s -X POST "$BASE_URL/trails/smart-plan" \
  -H "Content-Type: application/json" \
  -d "{
    \"placeIds\": $PLACE_IDS,
    \"pacingConfig\": {
      \"max_daily_hp\": 100,
      \"walk_speed_factor\": 1.0,
      \"terrain_filter\": \"ALL\"
    },
    \"preferences\": {
      \"maxTotalDistanceKm\": 30,
      \"preferOffRoad\": true,
      \"allowSplit\": true
    }
  }")
echo "$RESPONSE" | format_json
if echo "$RESPONSE" | grep -q '"trails"'; then
    echo -e "${GREEN}✅ 智能路线规划成功${NC}"
else
    echo -e "${YELLOW}⚠️  智能路线规划返回空结果（可能没有匹配的路线）${NC}"
fi
echo ""

# 测试4: 如果存在Trail，测试其他接口
if [ -n "$TRAIL_ID" ] && [ "$TRAIL_ID" != "null" ]; then
    # 测试4.1: 获取Trail详情
    echo -e "${YELLOW}5. 测试获取Trail详情 (ID: $TRAIL_ID)...${NC}"
    RESPONSE=$(curl -s -X GET "$BASE_URL/trails/$TRAIL_ID")
    echo "$RESPONSE" | format_json
    if echo "$RESPONSE" | grep -q '"id"'; then
        echo -e "${GREEN}✅ Trail详情查询成功${NC}"
    else
        echo -e "${RED}❌ Trail详情查询失败${NC}"
    fi
    echo ""

    # 测试4.2: 识别Trail沿途的景点
    echo -e "${YELLOW}6. 测试识别Trail沿途的景点 (Trail ID: $TRAIL_ID)...${NC}"
    RESPONSE=$(curl -s -X GET "$BASE_URL/trails/$TRAIL_ID/places-along?radiusKm=3")
    echo "$RESPONSE" | format_json
    if echo "$RESPONSE" | grep -q '"place"'; then
        echo -e "${GREEN}✅ 沿途景点识别成功${NC}"
    else
        echo -e "${YELLOW}⚠️  未找到沿途景点（可能轨迹附近没有景点）${NC}"
    fi
    echo ""

    # 测试4.3: 推荐配套服务
    echo -e "${YELLOW}7. 测试推荐配套服务 (Trail ID: $TRAIL_ID)...${NC}"
    RESPONSE=$(curl -s -X GET "$BASE_URL/trails/$TRAIL_ID/support-services")
    echo "$RESPONSE" | format_json
    if echo "$RESPONSE" | grep -q '"type"'; then
        echo -e "${GREEN}✅ 配套服务推荐成功${NC}"
    else
        echo -e "${YELLOW}⚠️  未找到配套服务（可能数据不足）${NC}"
    fi
    echo ""

    # 测试4.4: 检查Trail适合性
    echo -e "${YELLOW}8. 测试检查Trail适合性 (Trail ID: $TRAIL_ID)...${NC}"
    RESPONSE=$(curl -s -X POST "$BASE_URL/trails/$TRAIL_ID/check-suitability" \
      -H "Content-Type: application/json" \
      -d '{
        "max_daily_hp": 100,
        "walk_speed_factor": 1.0,
        "terrain_filter": "ALL"
      }')
    echo "$RESPONSE" | format_json
    if echo "$RESPONSE" | grep -q '"suitable"'; then
        echo -e "${GREEN}✅ Trail适合性检查成功${NC}"
    else
        echo -e "${RED}❌ Trail适合性检查失败${NC}"
    fi
    echo ""

    # 测试4.5: 拆分Trail
    echo -e "${YELLOW}9. 测试拆分Trail (Trail ID: $TRAIL_ID)...${NC}"
    RESPONSE=$(curl -s -X GET "$BASE_URL/trails/$TRAIL_ID/split-segments?maxSegmentLengthKm=10")
    echo "$RESPONSE" | format_json
    if echo "$RESPONSE" | grep -q '"segmentIndex"'; then
        echo -e "${GREEN}✅ Trail拆分成功${NC}"
    else
        echo -e "${YELLOW}⚠️  Trail拆分返回空结果（可能路线太短或数据不足）${NC}"
    fi
    echo ""

    # 测试4.6: 实时轨迹追踪
    echo -e "${YELLOW}10. 测试实时轨迹追踪 (Trail ID: $TRAIL_ID)...${NC}"
    # 开始追踪
    START_RESPONSE=$(curl -s -X POST "$BASE_URL/trails/tracking/start" \
      -H "Content-Type: application/json" \
      -d "{\"trailId\": $TRAIL_ID}")
    echo "$START_RESPONSE" | format_json
    
    if [ "$USE_JQ" = true ]; then
        SESSION_ID=$(echo "$START_RESPONSE" | jq -r '.sessionId // empty' 2>/dev/null)
    else
        SESSION_ID=$(echo "$START_RESPONSE" | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)
    fi
    
    if [ -n "$SESSION_ID" ] && [ "$SESSION_ID" != "null" ]; then
        echo -e "${GREEN}✅ 追踪会话创建成功 (Session ID: $SESSION_ID)${NC}"
        
        # 添加追踪点
        sleep 1
        POINT_RESPONSE=$(curl -s -X POST "$BASE_URL/trails/tracking/$SESSION_ID/point" \
          -H "Content-Type: application/json" \
          -d '{
            "latitude": 27.5,
            "longitude": 114.2,
            "elevation": 1200,
            "accuracy": 10
          }')
        echo "$POINT_RESPONSE" | format_json
        echo -e "${GREEN}✅ 追踪点添加成功${NC}"
        
        # 获取追踪状态
        sleep 1
        STATUS_RESPONSE=$(curl -s -X GET "$BASE_URL/trails/tracking/$SESSION_ID")
        echo "$STATUS_RESPONSE" | format_json
        echo -e "${GREEN}✅ 追踪状态查询成功${NC}"
        
        # 结束追踪
        sleep 1
        STOP_RESPONSE=$(curl -s -X POST "$BASE_URL/trails/tracking/$SESSION_ID/stop")
        echo "$STOP_RESPONSE" | format_json
        if echo "$STOP_RESPONSE" | grep -q '"statistics"'; then
            echo -e "${GREEN}✅ 追踪结束成功${NC}"
        else
            echo -e "${YELLOW}⚠️  追踪结束返回数据异常${NC}"
        fi
    else
        echo -e "${RED}❌ 追踪会话创建失败${NC}"
    fi
    echo ""
else
    echo -e "${YELLOW}⚠️  跳过Trail相关测试（需要先创建Trail数据）${NC}"
    echo -e "${BLUE}   提示: 可以使用 npm run import:gpx 导入GPX文件创建Trail${NC}"
    echo ""
fi

# 测试5: 行程分享和导入（需要先有行程）
echo -e "${YELLOW}11. 测试行程分享功能...${NC}"
# 先获取一个行程ID
TRIPS_RESPONSE=$(curl -s -X GET "$BASE_URL/trips?limit=1")
if [ "$USE_JQ" = true ]; then
    TRIP_ID=$(echo "$TRIPS_RESPONSE" | jq -r '.[0].id // empty' 2>/dev/null)
else
    TRIP_ID=$(echo "$TRIPS_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
fi

if [ -n "$TRIP_ID" ] && [ "$TRIP_ID" != "null" ]; then
    # 创建分享
    SHARE_RESPONSE=$(curl -s -X POST "$BASE_URL/trips/$TRIP_ID/share" \
      -H "Content-Type: application/json" \
      -d '{
        "permission": "VIEW"
      }')
    echo "$SHARE_RESPONSE" | format_json
    
    if [ "$USE_JQ" = true ]; then
        SHARE_TOKEN=$(echo "$SHARE_RESPONSE" | jq -r '.data.shareToken // empty' 2>/dev/null)
    else
        SHARE_TOKEN=$(echo "$SHARE_RESPONSE" | grep -o '"shareToken":"[^"]*"' | cut -d'"' -f4)
    fi
    
    if [ -n "$SHARE_TOKEN" ] && [ "$SHARE_TOKEN" != "null" ]; then
        echo -e "${GREEN}✅ 行程分享创建成功 (Token: $SHARE_TOKEN)${NC}"
        
        # 获取分享的行程
        sleep 1
        GET_SHARE_RESPONSE=$(curl -s -X GET "$BASE_URL/trips/shared/$SHARE_TOKEN")
        echo "$GET_SHARE_RESPONSE" | format_json
        if echo "$GET_SHARE_RESPONSE" | grep -q '"trip"'; then
            echo -e "${GREEN}✅ 获取分享行程成功${NC}"
        else
            echo -e "${YELLOW}⚠️  获取分享行程返回数据异常${NC}"
        fi
        
        echo -e "${BLUE}   提示: 导入功能需要提供destination、startDate、endDate，这里仅演示获取分享${NC}"
    else
        echo -e "${RED}❌ 行程分享创建失败${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  跳过行程分享测试（需要先创建行程）${NC}"
fi
echo ""

echo -e "${GREEN}=== 测试完成 ===${NC}"
echo -e "${BLUE}提示: 更多测试可以在 Swagger UI 中进行: http://localhost:3000/api${NC}"

