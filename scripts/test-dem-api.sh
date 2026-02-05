#!/bin/bash
# DEM API 测试脚本（Shell 版本）

API_BASE_URL="${API_BASE_URL:-http://localhost:5174}"

echo "=========================================="
echo "DEM API 测试"
echo "API Base URL: $API_BASE_URL"
echo "=========================================="
echo ""

# 测试 1: 获取单个坐标点的海拔
echo "测试 1: 获取单个坐标点海拔 (64.1466, -21.9426)"
echo "GET $API_BASE_URL/api/dem/elevation?lat=64.1466&lng=-21.9426"
curl -s -X GET "$API_BASE_URL/api/dem/elevation?lat=64.1466&lng=-21.9426" | jq '.' || echo "请求失败"
echo ""
echo "----------------------------------------"
echo ""

# 测试 2: 获取路线海拔剖面
echo "测试 2: 获取路线海拔剖面"
echo "POST $API_BASE_URL/api/dem/profile"
curl -s -X POST "$API_BASE_URL/api/dem/profile" \
  -H "Content-Type: application/json" \
  -d '{
    "polyline": [
      {"lat": 64.1466, "lng": -21.9426},
      {"lat": 64.1500, "lng": -21.9500},
      {"lat": 64.1600, "lng": -21.9600}
    ],
    "samples": 100,
    "activityType": "walking"
  }' | jq '.' || echo "请求失败"
echo ""
echo "----------------------------------------"
echo ""

# 测试 3: 获取行程地形数据（占位符）
echo "测试 3: 获取行程地形数据"
echo "GET $API_BASE_URL/api/dem/trip/test-trip-id-123/terrain"
curl -s -X GET "$API_BASE_URL/api/dem/trip/test-trip-id-123/terrain" | jq '.' || echo "请求失败"
echo ""
echo "----------------------------------------"
echo ""

# 测试 4: 参数验证错误 - 无效经纬度
echo "测试 4: 参数验证错误 - 无效经纬度"
echo "GET $API_BASE_URL/api/dem/elevation?lat=invalid&lng=invalid"
curl -s -X GET "$API_BASE_URL/api/dem/elevation?lat=invalid&lng=invalid" | jq '.' || echo "请求失败"
echo ""
echo "----------------------------------------"
echo ""

# 测试 5: 参数验证错误 - polyline 少于 2 个点
echo "测试 5: 参数验证错误 - polyline 少于 2 个点"
echo "POST $API_BASE_URL/api/dem/profile"
curl -s -X POST "$API_BASE_URL/api/dem/profile" \
  -H "Content-Type: application/json" \
  -d '{
    "polyline": [
      {"lat": 64.1466, "lng": -21.9426}
    ]
  }' | jq '.' || echo "请求失败"
echo ""
echo "=========================================="
