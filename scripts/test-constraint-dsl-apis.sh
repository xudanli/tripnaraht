#!/bin/bash

# 测试约束DSL和冲突检测API
# 使用方法: ./scripts/test-constraint-dsl-apis.sh

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
API_BASE="${API_BASE:-${BASE_URL}/decision}"

echo "=========================================="
echo "测试约束DSL和冲突检测API"
echo "=========================================="
echo "API Base URL: ${API_BASE}"
echo ""

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试函数
test_api() {
    local name=$1
    local endpoint=$2
    local data=$3
    
    echo -e "${YELLOW}测试: ${name}${NC}"
    echo "Endpoint: POST ${endpoint}"
    echo ""
    
    response=$(curl -s -w "\n%{http_code}" -X POST "${API_BASE}${endpoint}" \
        -H "Content-Type: application/json" \
        -d "${data}")
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq 200 ]; then
        echo -e "${GREEN}✓ 成功 (HTTP ${http_code})${NC}"
        echo "响应:"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        echo -e "${RED}✗ 失败 (HTTP ${http_code})${NC}"
        echo "响应:"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    fi
    echo ""
    echo "----------------------------------------"
    echo ""
}

# 测试1: 检测约束冲突
echo "=========================================="
echo "测试1: 检测约束冲突"
echo "=========================================="
test_api "检测预算与住宿品质冲突" "/detect-conflicts" '{
  "constraints": {
    "hard_constraints": {
      "budget": {
        "max": 12000,
        "currency": "USD",
        "flexible": false
      }
    },
    "soft_constraints": {
      "comfort_level": {
        "hotel_quality": "high",
        "weight": 0.9
      }
    }
  }
}'

# 测试2: 检测节奏与体力限制冲突
echo "=========================================="
echo "测试2: 检测节奏与体力限制冲突"
echo "=========================================="
test_api "检测节奏与体力限制冲突" "/detect-conflicts" '{
  "constraints": {
    "soft_constraints": {
      "pace": {
        "preference": "intense",
        "weight": 0.8
      }
    },
    "hard_constraints": {
      "physical_limitations": {
        "daily_activity_hours_max": 6
      }
    }
  }
}'

# 测试3: 检测交通方式与时间窗口冲突
echo "=========================================="
echo "测试3: 检测交通方式与时间窗口冲突"
echo "=========================================="
test_api "检测交通方式与时间窗口冲突" "/detect-conflicts" '{
  "constraints": {
    "hard_constraints": {
      "travel_mode": {
        "no_early_morning": true,
        "no_late_night": true
      }
    }
  },
  "plan": {
    "days": [
      {
        "day": 1,
        "date": "2026-06-10",
        "timeSlots": [
          {
            "id": "slot1",
            "time": "06:00",
            "title": "早起活动",
            "type": "sightseeing"
          },
          {
            "id": "slot2",
            "time": "23:00",
            "title": "夜车活动",
            "type": "sightseeing"
          }
        ]
      }
    ]
  }
}'

# 测试4: 检查约束并获取不可行性解释
echo "=========================================="
echo "测试4: 检查约束并获取不可行性解释"
echo "=========================================="
test_api "检查约束并获取不可行性解释" "/check-constraints-with-explanation" '{
  "state": {
    "context": {
      "destination": "IS",
      "startDate": "2026-06-10",
      "durationDays": 7,
      "preferences": {
        "pace": "moderate"
      },
      "budget": {
        "amount": 10000,
        "currency": "USD"
      }
    },
    "candidatesByDate": {},
    "signals": {}
  },
  "plan": {
    "version": "1.0.0",
    "createdAt": "2026-02-02T10:00:00Z",
    "days": [
      {
        "day": 1,
        "date": "2026-06-10",
        "timeSlots": []
      }
    ],
    "metrics": {
      "estTotalCost": 15000
    }
  }
}'

# 测试5: 生成多个方案（简化版，因为需要完整的世界状态）
echo "=========================================="
echo "测试5: 生成多个方案"
echo "=========================================="
echo -e "${YELLOW}注意: 此测试需要完整的世界状态，可能会失败${NC}"
echo ""

test_api "生成多个方案" "/generate-multiple-plans" '{
  "state": {
    "context": {
      "destination": "IS",
      "startDate": "2026-06-10",
      "durationDays": 7,
      "preferences": {
        "pace": "moderate",
        "intents": {
          "nature": 0.8
        }
      },
      "budget": {
        "amount": 12000,
        "currency": "USD"
      }
    },
    "candidatesByDate": {},
    "signals": {},
    "policies": {
      "constraintDSL": {
        "hard_constraints": {
          "budget": {
            "max": 12000,
            "currency": "USD",
            "flexible": false
          }
        },
        "soft_constraints": {
          "pace": {
            "preference": "moderate",
            "weight": 0.8
          }
        }
      }
    }
  },
  "constraints": {
    "hard_constraints": {
      "budget": {
        "max": 12000,
        "currency": "USD",
        "flexible": false
      }
    },
    "soft_constraints": {
      "pace": {
        "preference": "moderate",
        "weight": 0.8
      }
    }
  }
}'

echo "=========================================="
echo "所有测试完成"
echo "=========================================="
