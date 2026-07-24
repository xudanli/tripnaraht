# MERGE_RECORD — fill after GitHub merge

**Do not edit** annotated evidence tag `claim-evidence-matrix-v2.0` (stays at `c76fff367…`).  
Create a **separate release tag** on `final_merge_commit`, e.g.:

- `v31-agent-interface-hardening-rc1`, or  
- `v31-agent-interface-hardening-release`

```yaml
pr_url: PENDING
pr_number: PENDING
pr_base: master
pr_head: feat/v31-engineering-hardening
branch_tip_at_pr_open: a56b4f9c3
final_merge_commit: PENDING
merged_at: PENDING  # ISO-8601 UTC
approved_by:
  engineering_lead: PENDING  # GitHub login
  tech_architect: PENDING
  qa_lead: PENDING
required_checks_result: PENDING  # pass | fail + summary URL
release_tag: PENDING  # must be v31-agent-interface-hardening-rc1
release_tag_target: PENDING  # must equal final_merge_commit
evidence_tag_unchanged: claim-evidence-matrix-v2.0
evidence_tag_target: c76fff36766e203065bd73e157e19fbf23fb02a7
```

## After merge — next deliverables (only)

1. This **Merge Record** fully filled  
2. **RRR** Gate 1–5 signed → GO / NO_GO / CONDITIONAL_GO_WITH_UNMET_CONDITIONS  
3. Release tag `v31-agent-interface-hardening-rc1` on `final_merge_commit`  

## Post-merge checklist

- [ ] `pr_url` / `pr_number` recorded  
- [ ] EL / TA / QA GitHub Approve == `SIGNATURES.md` roles  
- [ ] Required Checks green  
- [ ] `final_merge_commit` written here + `RELEASE_READINESS_DECISION.md`  
- [ ] Release tag `v31-agent-interface-hardening-rc1` on merge commit only  
- [ ] `claim-evidence-matrix-v2.0` **not** moved  
- [ ] No unreviewed force-push of merge history  
- [ ] RRR final decision signed (next after this record)  
