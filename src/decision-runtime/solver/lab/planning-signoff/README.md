# Planning Sign-off Artifacts（M4 Release Gate）

M4 是 **Release Authorization Gate**。当前执行 [M4-RA-01A Preflight](../../M4_RA_01A_PILOT_PREFLIGHT.md)。

```
planning-signoff/
  CURRENT
  selected-trips.whitelist.json
  <YYYY-MM-DD>/
    stability.json | locality.json | gateway.json | rollback.json
    authority.json   ← Product Approval Package（受限 scope）
```

## 命令

```bash
npm run lab:seal-planning-signoff          # engineering only
npm run lab:prepare-product-approval       # DRAFT authority.json (scoped)
# product edits → status=APPROVED, approved=true, accountability filled
OR_TOOLS_AUTHORITY_TOKEN_SECRET=... npm run lab:mint-authority-token
npm run lab:rollback-drill -- --checklist
npm run lab:run-rollback-drill-harness   # lab token + mechanism drill
npm run lab:mint-authority-token -- --test-pkg
npm run lab:seal-rollback-drill -- --result PASS --operator <you>  # remote live only
npm run lab:go-no-go
npm run lab:authority-readiness
```

Kill-switch：[CANARY_ROLLBACK_SOP.md](../../CANARY_ROLLBACK_SOP.md)
```

## Authority Token

`OR_TOOLS_AUTHORITY_TOKEN` = HMAC 签名 claims：

- `signoffId` · `artifactHash` · `environment` · `provider` · `allowedOperations` · `expiresAt` · `canaryStage`

禁止：产品只批了 SHIFT/SWAP，运行时却因裸 env 打开 MOVE_DAY 权威路径（scope gate 会回落 Neptune）。

## Canary

```
shadow → selected_trips → 5% → 20% → 50% → 100%
```

M4-RA-01 **停在 selected_trips**。
