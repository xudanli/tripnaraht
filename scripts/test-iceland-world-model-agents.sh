#!/bin/bash
# 冰岛 WorldModel Agents 测试
# 获取 WeatherAgent、GeoAgent、CostAgent 的冰岛数据
# 使用 --transpile-only 跳过 TS 严格检查，避免项目内其他文件的编译错误
exec npx ts-node --transpile-only scripts/test-iceland-world-model-agents.ts
