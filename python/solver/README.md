# TripNARA OR-Tools Solver Service

ADR-008 · **Planning Engine Phase 0（Shadow Candidate Generation）= DONE**。  
非权威 Routing 候选（SHIFT / SWAP / REROUTE / SHORTEN / REPLACE；**MOVE_DAY** 需 `OR_TOOLS_MOVE_DAY_SHADOW=1`）。  
Roadmap：`src/decision-runtime/PLANNING_ENGINE_ROADMAP.md`（M1 DONE · M2 Shadow MVP · M4 Authority Blocked）。

Evaluate：`REPLACE_POOL` ← `ICELAND_POI_ALTERNATIVES`（miss → synthetic）。  
S4 Planning：`OPTIMIZE_ROUTE` / `AUTO_ARRANGE` → `ortoolsShadow`。金样 Lab：`npm run lab:planning-gold`。

## 权威边界

- **有**：候选生成 / 数学求解 / 局部优化  
- **无**：约束最终解释 / 风险裁决 / 写入 Plan Version  

`solverFeasible ≠ executability`。  
Routing 路径 `nativeCpSat=false`；仅 `OR_TOOLS_NATIVE_CPSAT=1` 时 SHIFT 走真 `CpSolver` 且 `engine=OR_TOOLS_CP_SAT`。

## 接口

| Method | Path | 说明 |
|--------|------|------|
| GET | `/health` | 探活 |
| POST | `/v1/solve` | `SolverProblem` → `SolverResponse` |

Schema 与 Nest 侧对齐（**S4.5 IR Freeze @v1**）：

- `src/decision-runtime/solver/PLANNING_IR_FREEZE.md`
- `src/decision-runtime/solver/contracts/solver-problem.ts`
- `src/decision-runtime/solver/contracts/solver-response.ts`

## 本地运行

```bash
cd python/solver
# recommended: uv (fast). Mirror optional if files.pythonhosted.org is slow.
uv venv .venv
UV_HTTP_TIMEOUT=300 uv pip install --python .venv/bin/python \
  --index-url https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt
source .venv/bin/activate
uvicorn app:app --host 0.0.0.0 --port 8091
```

Smoke：

```bash
curl -s localhost:8091/health | jq .
curl -s -X POST localhost:8091/v1/solve \
  -H 'content-type: application/json' \
  -d @fixtures/day_shift_swap_10.json | jq '.status, .solverMeta, (.candidates|length)'
```

测试：

```bash
pytest tests/ -q
```

## Lab Sign-off（ADR-008）

离线门槛（seed 可复现、禁边、n=20/50 P95、超时降级）。**不晋升权威**：

```bash
python lab_signoff.py --repeats 5 --out /tmp/ortools-lab-signoff.json
echo $?   # 0=PASS 1=FAIL
```

一体门禁（pytest + Lab + Nest `decision-runtime/solver`）：

```bash
# from repo root
npm run ci:ortools-adr008
# or
bash scripts/ci/run-ortools-adr008-gate.sh
```

CI：`.github/workflows/ortools-adr008-ci.yml`（path filter：`python/solver/**`、`src/decision-runtime/solver/**`）。

Nest 侧指标门禁（写入/禁边违规）：

```bash
curl -s localhost:3000/decision-engine/v1/ortools-shadow/lab-signoff/gate | jq .
curl -s localhost:3000/decision-engine/v1/ortools-shadow/metrics | jq .
curl -s localhost:3000/decision-engine/v1/ortools-shadow/planning-lab/compare | jq .
```

离线 SWAP 目标值 demo（对照 Nest `labCompare`，不晋升权威）：

```bash
python planning_lab_compare_demo.py
```

## Nest 环境变量

```bash
OR_TOOLS_SOLVER_URL=http://127.0.0.1:8091
OR_TOOLS_REPAIR_SHADOW=1
```

未设置 `OR_TOOLS_SOLVER_URL` 时，Nest `OrToolsRepairProvider` 不发起调用（空提案）。

## Live smoke（sidecar 已启动时）

```bash
# from repo root — health + SWAP/REROUTE/SHORTEN/REPLACE + road-close harness
npm run smoke:ortools-live
# or
OR_TOOLS_SOLVER_URL=http://127.0.0.1:8091 bash scripts/ci/ortools-live-smoke.sh
```

报告写入 `artifacts/ortools-live-smoke/`（`authoritativePromotion` 恒为 false）。
