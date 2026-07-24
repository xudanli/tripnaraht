# Decision Trajectory → Python 训练桥接

## 数据流

1. 在线：`DECISION_TRAJECTORY_ENABLED=1` → `decision_trajectories` 表
2. 离线 ETL：`TRAINING_DECISION_TRAJECTORY_ETL_ENABLED=1` → `./data/training/decision-trajectories/dpo_preferences_*.jsonl`
3. Python 注册：`TRAINING_PYTHON_DATASET_REGISTER_ENABLED=1` → `/app/data/tripnara_dpo_preferences.jsonl`
4. 训练：`TRAINING_STAGE=dpo` → `train_dpo.py`（TRL DPOTrainer）

## 环境变量（Nest）

```bash
TRAINING_DECISION_TRAJECTORY_ETL_ENABLED=1
TRAINING_DECISION_TRAJECTORY_OUTPUT_DIR=./data/training/decision-trajectories
TRAINING_PYTHON_DATASET_REGISTER_ENABLED=1
TRAINING_PYTHON_PATH_MOUNT_FROM=./data/training/decision-trajectories
TRAINING_PYTHON_PATH_MOUNT_TO=/app/data/host-training/decision-trajectories
TRAINING_STAGE=dpo
TRAINING_DPO_PAIR_TYPES=planner_obedience
TRAINING_DPO_REJECTED_SOURCES=true_topology
TRAIN_SERVICE_URL=http://localhost:8000
```

## DPO JSONL 字段

| 字段 | 说明 |
|------|------|
| `prompt` | Planner / Debate 上下文 |
| `chosen` | 门控后最终输出 |
| `rejected` | 真拓扑 draft 或 violation_surrogate |
| `pair_type` | `planner_obedience` \| `debate_narrator` |
| `rejected_source` | `true_topology` \| `violation_surrogate`（Planner 专用） |

## 手动注册

```bash
chmod +x scripts/training/ingest-decision-pack.sh
./scripts/training/ingest-decision-pack.sh
```

## sft_then_dpo 两阶段串联（生产推荐）

**算法依赖**：先 SFT（Chain-of-Repair 懂规矩）→ 再 DPO（真拓扑定直觉）。跳过 SFT 直接 DPO 有 Mode Collapse 风险。

### 环境变量

```bash
TRAINING_STAGE=sft_then_dpo
TRAINING_DECISION_TRAJECTORY_ETL_ENABLED=1
TRAINING_PYTHON_DATASET_REGISTER_ENABLED=1
TRAINING_SFT_NUM_EPOCHS=3
TRAINING_DPO_NUM_EPOCHS=2
TRAINING_DPO_REJECTED_SOURCES=true_topology
TRAINING_DPO_PAIR_TYPES=planner_obedience
```

### Nest API

- `POST /training/pipeline/sft-then-dpo` — 启动串联
- `GET /training/pipeline/:taskId` — 轮询状态（`sft_running` → `sft_completed` → `dpo_running` → `completed`）
- `POST /training/pipeline/flywheel` — ETL + 串联（`wait: true` 阻塞至完成）

### 产物路径（Python 容器内）

| 阶段 | 路径 |
|------|------|
| SFT 权重 | `/app/outputs/{task_id}/checkpoint-sft-final` |
| 生产 LoRA | `/app/outputs/{task_id}/checkpoint-dpo-final` |

DPO 阶段以 `checkpoint-sft-final` 为可训练 adapter，在 SFT 基础上做偏好对齐。

## 直接训练（容器内）

```bash
export TRAINING_DPO_DATASET_PATH=/app/data/tripnara_dpo_preferences.jsonl
python train_dpo.py --config config/tripnara_dpo.yaml
```

## Docker volume

`docker-compose.train.yml` 已将宿主 `data/training/decision-trajectories` 挂载到
`/app/data/host-training/decision-trajectories`。
