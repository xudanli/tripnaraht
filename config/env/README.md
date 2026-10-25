# 环境变量模板

从仓库根目录收拢的 `.env.*.example` / runtime 片段。  
本地仍使用根目录 **`.env`**（Nest `ConfigModule` 默认加载）；按需把对应模板内容追加进 `.env`。

| 文件 | 场景 |
|------|------|
| `decision-os.example` | Decision OS 门禁 |
| `production-transition.example` | 生产切换观察窗 |
| `canonical-authority-staging.example` | Canonical Authority staging |
| `harness-production.example` | Harness / 可观测生产 |
| `unified-decision-frontend.example` | 统一决策前端联调 |
| `exploration-ai.example` | Exploration AI 路线 |
| `travel-context.example` | Travel Context |
| `patent-6.5.example` | 专利 6.5 演示环境 |
| `m1.example` | M1 staging preflight |
| `production-canary.runtime` | 生产 canary runtime 片段 |
