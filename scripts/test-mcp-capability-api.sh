#!/bin/bash

# Test script for MCP Capability Management API
# Usage: ./scripts/test-mcp-capability-api.sh

BASE_URL="${BASE_URL:-http://localhost:3000/api}"

echo "🧪 Testing MCP Capability Management API"
echo "Base URL: $BASE_URL"
echo ""

# Test 1: Get all capabilities
echo "1️⃣  Testing: GET /mcp/capabilities"
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/mcp/capabilities")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')
echo "HTTP Status: $http_code"
if [ "$http_code" = "200" ]; then
    echo "✅ Success"
    echo "$body" | jq '.data | length' 2>/dev/null && echo "capabilities found" || echo "$body" | head -5
else
    echo "❌ Failed"
    echo "$body" | head -10
fi
echo ""

# Test 2: Get statistics
echo "2️⃣  Testing: GET /mcp/capabilities/statistics"
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/mcp/capabilities/statistics")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')
echo "HTTP Status: $http_code"
if [ "$http_code" = "200" ]; then
    echo "✅ Success"
    echo "$body" | jq '.' 2>/dev/null || echo "$body" | head -10
else
    echo "❌ Failed"
    echo "$body" | head -10
fi
echo ""

# Test 3: Get single capability
echo "3️⃣  Testing: GET /mcp/capabilities/google_maps"
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/mcp/capabilities/google_maps")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')
echo "HTTP Status: $http_code"
if [ "$http_code" = "200" ]; then
    echo "✅ Success"
    echo "$body" | jq '.data.serviceName, .data.enabled' 2>/dev/null || echo "$body" | head -5
else
    echo "❌ Failed"
    echo "$body" | head -10
fi
echo ""

# Test 4: Update capability status
echo "4️⃣  Testing: PUT /mcp/capabilities/stripe/status (disable)"
response=$(curl -s -w "\n%{http_code}" -X PUT "$BASE_URL/mcp/capabilities/stripe/status" \
    -H "Content-Type: application/json" \
    -d '{"serviceName": "stripe", "status": "disabled"}')
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')
echo "HTTP Status: $http_code"
if [ "$http_code" = "200" ]; then
    echo "✅ Success"
    echo "$body" | jq '.data.enabled' 2>/dev/null || echo "$body" | head -5
else
    echo "❌ Failed"
    echo "$body" | head -10
fi
echo ""

# Test 5: Check enabled status
echo "5️⃣  Testing: GET /mcp/capabilities/stripe/enabled"
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/mcp/capabilities/stripe/enabled")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')
echo "HTTP Status: $http_code"
if [ "$http_code" = "200" ]; then
    echo "✅ Success"
    echo "$body" | jq '.data.enabled' 2>/dev/null || echo "$body" | head -5
else
    echo "❌ Failed"
    echo "$body" | head -10
fi
echo ""

# Test 6: Re-enable
echo "6️⃣  Testing: PUT /mcp/capabilities/stripe/status (enable)"
response=$(curl -s -w "\n%{http_code}" -X PUT "$BASE_URL/mcp/capabilities/stripe/status" \
    -H "Content-Type: application/json" \
    -d '{"serviceName": "stripe", "status": "enabled"}')
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')
echo "HTTP Status: $http_code"
if [ "$http_code" = "200" ]; then
    echo "✅ Success"
    echo "$body" | jq '.data.enabled' 2>/dev/null || echo "$body" | head -5
else
    echo "❌ Failed"
    echo "$body" | head -10
fi
echo ""

echo "🎉 Test completed!"
