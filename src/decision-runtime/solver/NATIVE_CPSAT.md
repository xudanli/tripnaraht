# Native CP-SAT — M3 / P5

> **状态：SHADOW MVP（2026-07-15）**  
> 真 `ortools.sat.python.cp_model.CpModel` + `CpSolver`。  
> **禁止** Routing 路径设置 `nativeCpSat=true`。  
> 仓库 `cp-sat-lexicographic` **不是**本路径。

## Flag

```bash
# Nest + Python sidecar (default off)
OR_TOOLS_NATIVE_CPSAT=1
```

## 覆盖

| Op | 行为 |
|----|------|
| `SHIFT` | CP-SAT 区间链：TW + 服务 + travel precedence；`engine=OR_TOOLS_CP_SAT`，`nativeCpSat=true` |
| 其他 | 仍走 Routing（`nativeCpSat=false`） |

实现：`python/solver/cp_sat_shift_solver.py`

## 诚实性规则

| 条件 | Meta |
|------|------|
| Routing 求解 | `OR_TOOLS_ROUTING` + `nativeCpSat=false` |
| CpSolver.Solve 已调用 | `OR_TOOLS_CP_SAT` + `nativeCpSat=true`（含无 incumbent） |
| Flag 关 / 非 SHIFT | 永不声明 native |

Nest client 拒绝 `nativeCpSat=true && engine=OR_TOOLS_ROUTING`。

## 非目标

- ❌ 全量 VRPTW CP-SAT  
- ❌ MOVE_DAY CP-SAT（可后续）  
- ❌ Authoritative  
- ❌ 用 lex-rank 引擎冒充  

## 后续（可选）

- IntervalVar + NoOverlap 多活动并行窗  
- REPLACE/SHORTEN 选择变量  
- `@v2` `engine ∈ {routing\|cp_sat\|hybrid}`  
