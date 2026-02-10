#!/bin/bash
# 测试 Road.is API 连接
# 使用方法: ./scripts/test-road-is-api.sh

BASE_URL="https://www.road.is"
ICELAND_CENTER_LAT=64.5
ICELAND_CENTER_LNG=-18.5
RADIUS=50000

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}测试 Road.is API 连接${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}测试参数:${NC}"
echo "  基础URL: ${BASE_URL}"
echo "  坐标: (${ICELAND_CENTER_LAT}, ${ICELAND_CENTER_LNG})"
echo "  半径: ${RADIUS}m"
echo ""

# 测试 1: DATEX II 端点
echo -e "${CYAN}测试 1: DATEX II 端点${NC}"
echo "URL: ${BASE_URL}/api/datex2/roadconditions"
echo ""
HTTP_CODE=$(curl -s -o /tmp/datex2_response.json -w "%{http_code}" \
  "${BASE_URL}/api/datex2/roadconditions?lat=${ICELAND_CENTER_LAT}&lon=${ICELAND_CENTER_LNG}&radius=${RADIUS}" \
  --max-time 10)

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ HTTP 200 - API 端点可用${NC}"
  echo "响应内容（前500字符）:"
  head -c 500 /tmp/datex2_response.json | python3 -m json.tool 2>/dev/null || head -c 500 /tmp/datex2_response.json
  echo ""
elif [ "$HTTP_CODE" = "404" ]; then
  echo -e "${YELLOW}⚠️ HTTP 404 - 端点不存在${NC}"
elif [ "$HTTP_CODE" = "000" ]; then
  echo -e "${RED}❌ 连接失败 - 无法访问 ${BASE_URL}${NC}"
else
  echo -e "${YELLOW}⚠️ HTTP ${HTTP_CODE}${NC}"
  echo "响应内容:"
  head -c 200 /tmp/datex2_response.json
fi
echo ""

# 测试 2: 标准 API 端点
echo -e "${CYAN}测试 2: 标准 API 端点${NC}"
echo "URL: ${BASE_URL}/api/roadconditions"
echo ""
HTTP_CODE=$(curl -s -o /tmp/roadconditions_response.json -w "%{http_code}" \
  "${BASE_URL}/api/roadconditions?lat=${ICELAND_CENTER_LAT}&lon=${ICELAND_CENTER_LNG}&radius=${RADIUS}" \
  --max-time 10)

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ HTTP 200 - API 端点可用${NC}"
  echo "响应内容（前500字符）:"
  head -c 500 /tmp/roadconditions_response.json | python3 -m json.tool 2>/dev/null || head -c 500 /tmp/roadconditions_response.json
  echo ""
elif [ "$HTTP_CODE" = "404" ]; then
  echo -e "${YELLOW}⚠️ HTTP 404 - 端点不存在${NC}"
elif [ "$HTTP_CODE" = "000" ]; then
  echo -e "${RED}❌ 连接失败 - 无法访问 ${BASE_URL}${NC}"
else
  echo -e "${YELLOW}⚠️ HTTP ${HTTP_CODE}${NC}"
  echo "响应内容:"
  head -c 200 /tmp/roadconditions_response.json
fi
echo ""

# 测试 3: F 路端点
echo -e "${CYAN}测试 3: F 路端点${NC}"
echo "URL: ${BASE_URL}/api/froads"
echo ""
HTTP_CODE=$(curl -s -o /tmp/froads_response.json -w "%{http_code}" \
  "${BASE_URL}/api/froads?lat=${ICELAND_CENTER_LAT}&lon=${ICELAND_CENTER_LNG}&radius=${RADIUS}" \
  --max-time 10)

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ HTTP 200 - API 端点可用${NC}"
  echo "响应内容（前500字符）:"
  head -c 500 /tmp/froads_response.json | python3 -m json.tool 2>/dev/null || head -c 500 /tmp/froads_response.json
  echo ""
elif [ "$HTTP_CODE" = "404" ]; then
  echo -e "${YELLOW}⚠️ HTTP 404 - 端点不存在${NC}"
elif [ "$HTTP_CODE" = "000" ]; then
  echo -e "${RED}❌ 连接失败 - 无法访问 ${BASE_URL}${NC}"
else
  echo -e "${YELLOW}⚠️ HTTP ${HTTP_CODE}${NC}"
  echo "响应内容:"
  head -c 200 /tmp/froads_response.json
fi
echo ""

# 测试 4: 检查网站可访问性
echo -e "${CYAN}测试 4: 检查网站可访问性${NC}"
echo "URL: ${BASE_URL}"
echo ""
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "${BASE_URL}" \
  --max-time 10)

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ HTTP 200 - 网站可访问${NC}"
elif [ "$HTTP_CODE" = "000" ]; then
  echo -e "${RED}❌ 连接失败 - 无法访问 ${BASE_URL}${NC}"
  echo "可能原因:"
  echo "  - 网络连接问题"
  echo "  - DNS 解析失败"
  echo "  - 防火墙阻止"
else
  echo -e "${YELLOW}⚠️ HTTP ${HTTP_CODE}${NC}"
fi
echo ""

# 测试 5: 检查 DATEX II 文档页面
echo -e "${CYAN}测试 5: 检查 DATEX II 文档页面${NC}"
echo "URL: ${BASE_URL}/travel-info/road-conditions-and-weather/road-conditions-api/"
echo ""
HTTP_CODE=$(curl -s -o /tmp/datex2_doc.html -w "%{http_code}" \
  "${BASE_URL}/travel-info/road-conditions-and-weather/road-conditions-api/" \
  --max-time 10)

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ HTTP 200 - 文档页面可访问${NC}"
  echo "页面标题:"
  grep -i "<title>" /tmp/datex2_doc.html | head -1 | sed 's/<[^>]*>//g' || echo "无法提取标题"
elif [ "$HTTP_CODE" = "404" ]; then
  echo -e "${YELLOW}⚠️ HTTP 404 - 文档页面不存在${NC}"
else
  echo -e "${YELLOW}⚠️ HTTP ${HTTP_CODE}${NC}"
fi
echo ""

# 总结
echo -e "${BLUE}========================================${NC}"
echo -e "${CYAN}测试总结${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "如果所有 API 端点都返回 404 或连接失败，可能原因："
echo "  1. Road.is 可能没有公开的 REST API"
echo "  2. API 端点路径不正确"
echo "  3. 需要认证或 API Key"
echo "  4. 网络环境无法访问 road.is"
echo ""
echo "建议："
echo "  1. 查看 road.is 官方文档"
echo "  2. 联系冰岛道路管理局获取 API 文档"
echo "  3. 考虑使用 Web Scraping 作为降级方案"
echo "  4. 使用静态数据文件作为后备方案"
echo ""

# 清理临时文件
rm -f /tmp/datex2_response.json /tmp/roadconditions_response.json /tmp/froads_response.json /tmp/datex2_doc.html
