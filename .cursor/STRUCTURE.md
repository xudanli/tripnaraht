# `.cursor/` 目录分层（能力 vs 组织 vs 流程 vs 专题）

**判断标准（一句话）**：

| 若目录回答的是… | 则属于… |
|-----------------|---------|
| 「**怎么调用一个能力**」（原子契约、指向 `src/skills/`） | **`skills/`** 下 `decision/`、`domain/`、`knowledge/`、`orchestration/`、`platform/` 各 `*.md` |
| 「**谁负责、谁判断**」（Claude 协作视角） | **`.claude/roles/*.md`**；Cursor 侧组织索引见 **`org/`** |
| 「**整条流程怎么跑**」（INTAKE→…→NARRATE） | **`pipelines/*.md`** |
| 「**某一技术专题怎么实现/验收**」（长文、多文件） | **`capabilities/*/`**（每包 `SKILL.md` + 附属 md） |

---

## 当前布局

```
.cursor/
  STRUCTURE.md          ← 本文件
  skills/
    README.md           ← `/` 快捷入口表 + 指向 capabilities / org
    decision/*.md       ← 原子能力（契约 stub）
    domain/*.md
    knowledge/*.md
    orchestration/*.md
    platform/*.md
  pipelines/
    *.md                ← Playbook：流程与阶段，链到 capabilities
  capabilities/
    */SKILL.md          ← 工程专题（原「误放在 skills 下」的包）
    cgus/ kernel/ …   ← 短名入口，等价链到长包
  org/
    decision-platform-roles/
    team/
    tripnara-org-capability-system/
  roles/
    README.md           ← 说明：权威角色文在仓库 .claude/roles/
```

**错觉纠正**：`cgus-engineering`、`orchestration-mainline` **不是**原子 Skill，是 **capability 专题**；**`team`**、**`decision-platform-roles`** 是 **org**，不是 Skill。

---

## `.claude/roles/`（与 `.cursor/` 的关系）

**Role 正文**仍在 **`.claude/roles/`**（与 `role-skill-manifest.json` 的 `prompt` 路径一致）。`.cursor/roles/README.md` 仅作导航，避免重复维护两套角色长文。
