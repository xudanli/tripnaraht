# 行程规划相关接口总结

## Swagger 访问

**当前状态**：❌ **Swagger 已被禁用**

Swagger 配置在 `src/main.ts` 中被注释掉了（第213-255行），所以目前无法访问 `/api-docs`。

如果启用 Swagger，访问地址应该是：
```
http://localhost:3000/api-docs
```

---

## 行程规划核心接口

### 📍 `/api/trips` - 行程管理

#### 创建和查询

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/trips` | 创建新行程（标准创建或从草案创建） |
| `POST` | `/api/trips/from-natural-language` | 从自然语言创建行程（AI 解析） |
| `GET` | `/api/trips` | 获取所有行程列表 |
| `GET` | `/api/trips/:id` | 获取单个行程详情（全景视图） |
| `PUT` | `/api/trips/:id` | 更新行程基本信息 |
| `DELETE` | `/api/trips/:id` | 删除行程 |

#### 行程状态和调度

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/trips/:id/state` | 获取行程当前状态（下一站信息等） |
| `GET` | `/api/trips/:id/schedule` | 获取行程日程表 |
| `PUT` | `/api/trips/:id/schedule` | 保存行程日程表 |

#### 行程草案（AI 生成）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/trips/draft` | 生成行程草案（AI 生成，不落库） |
| `POST` | `/api/trips/:tripId/items/:itemId/replace` | 替换单个行程项 |
| `POST` | `/api/trips/:tripId/regenerate` | 全局重生成行程 |

#### 操作历史（撤销/重做）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/trips/:id/actions` | 获取操作历史 |
| `POST` | `/api/trips/:id/actions/undo` | 撤销操作 |
| `POST` | `/api/trips/:id/actions/redo` | 重做操作 |

#### 协作和分享

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/trips/:id/collaborators` | 添加协作者 |
| `GET` | `/api/trips/:id/collaborators` | 获取协作者列表 |
| `DELETE` | `/api/trips/:id/collaborators/:userId` | 移除协作者 |
| `POST` | `/api/trips/:id/share` | 创建分享链接 |
| `GET` | `/api/trips/shared/:shareToken` | 通过分享链接查看行程 |
| `POST` | `/api/trips/shared/:shareToken/import` | 导入分享的行程 |

#### 收藏和点赞

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/trips/:id/collect` | 收藏行程 |
| `DELETE` | `/api/trips/:id/collect` | 取消收藏 |
| `POST` | `/api/trips/:id/like` | 点赞行程 |
| `DELETE` | `/api/trips/:id/like` | 取消点赞 |
| `GET` | `/api/trips/featured` | 获取精选行程 |

#### 预算管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/trips/:id/budget/summary` | 获取预算摘要 |
| `GET` | `/api/trips/:id/budget/alert` | 获取预算预警 |
| `GET` | `/api/trips/:id/budget/optimization` | 获取预算优化建议 |
| `GET` | `/api/trips/:id/budget/report` | 获取预算报告 |

#### 行程调整

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/trips/:id/adjust` | 调整行程（修改日期、地点等） |
| `GET` | `/api/trips/:id/metrics` | 获取行程指标（总距离、总时间等） |
| `GET` | `/api/trips/:id/days/:dayId/metrics` | 获取单日指标 |
| `GET` | `/api/trips/:id/conflicts` | 获取行程冲突检测结果 |

#### 意图和优化

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/trips/:id/intent` | 获取行程意图分析 |
| `PUT` | `/api/trips/:id/intent` | 更新行程意图 |
| `POST` | `/api/trips/:id/apply-optimization` | 应用优化建议 |

#### 建议系统

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/trips/:id/suggestions` | 获取优化建议列表 |
| `GET` | `/api/trips/:id/suggestions/stats` | 获取建议统计 |
| `POST` | `/api/trips/:id/suggestions/:suggestionId/apply` | 应用建议 |
| `POST` | `/api/trips/:id/suggestions/:suggestionId/dismiss` | 忽略建议 |

#### 决策日志和证据

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/trips/:id/decision-log` | 获取决策日志 |
| `GET` | `/api/trips/:id/evidence` | 获取决策证据 |
| `GET` | `/api/trips/:id/persona-alerts` | 获取人格预警 |

#### 任务管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/trips/:id/tasks` | 获取任务列表 |
| `PATCH` | `/api/trips/:id/tasks/:taskId` | 更新任务状态 |
| `GET` | `/api/trips/:id/pipeline-status` | 获取管道状态 |

#### 行程项管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/trips/:id/items/:itemId/detail` | 获取行程项详情 |
| `POST` | `/api/trips/:id/items/batch-update` | 批量更新行程项 |

#### 紧急和安全

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/trips/:id/emergency/sos` | 发送紧急 SOS |
| `GET` | `/api/trips/:id/emergency/history` | 获取紧急事件历史 |

#### 行程总结

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/trips/:id/recap` | 获取行程总结 |
| `GET` | `/api/trips/:id/recap/export` | 导出行程总结 |
| `GET` | `/api/trips/:id/trail-video-data` | 获取轨迹视频数据 |

#### 离线功能

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/trips/:id/offline-pack` | 获取离线数据包 |
| `GET` | `/api/trips/:id/offline-status` | 获取离线同步状态 |
| `POST` | `/api/trips/:id/offline-sync` | 同步离线数据 |

---

## 其他相关接口模块

### 🚗 `/api/transport` - 交通规划

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/transport/plan` | 规划交通路线（智能推荐） |

### 🥾 `/api/trails` - 徒步路线

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/trails/smart-plan` | 智能路线规划（景点+轨迹组合） |

### 🎫 `/api/railpass` - 铁路通票

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/railpass/reservation/plan` | 规划订座任务 |
| `POST` | `/api/railpass/travel-days/simulate` | 模拟使用天数 |

### 📋 `/api/readiness` - 旅行准备度

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/readiness/trip/:id` | 获取准备度检查结果 |
| `PUT` | `/api/readiness/trip/:tripId/checklist/status` | 更新清单状态 |
| `GET` | `/api/readiness/trip/:tripId/checklist/status` | 获取清单状态 |
| `POST` | `/api/readiness/trip/:tripId/packing-list/generate` | 生成打包清单 |
| `GET` | `/api/readiness/trip/:tripId/packing-list` | 获取打包清单 |

### 🤖 `/api/planning-policy` - 规划策略

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/planning-policy/evaluate` | 评估规划策略 |
| `POST` | `/api/planning-policy/what-if` | What-If 分析 |

### 🎯 `/api/route-directions` - 路线方向

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/route-directions` | 获取路线方向列表 |
| `GET` | `/api/route-directions/templates` | 获取路线模板 |

### 🧠 `/api/agent` - 智能体统一入口

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/agent/route-and-run` | 路由并执行（COALA + ReAct） |

### 🔍 `/api/decision` - 决策层接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/decision/logs` | 获取决策日志 |

---

## 接口统计

- **行程管理接口**：约 50+ 个
- **交通规划接口**：1 个
- **徒步路线接口**：1 个
- **铁路通票接口**：多个
- **准备度检查接口**：多个
- **规划策略接口**：多个

**总计**：约 **60+ 个行程规划相关接口**

---

## 启用 Swagger（如果需要）

要启用 Swagger，需要取消注释 `src/main.ts` 中的相关代码（第213-255行）。

启用后访问地址：
```
http://localhost:3000/api-docs
```

**注意**：启用 Swagger 可能会稍微影响启动时间，但可以方便地查看和测试所有 API 接口。
