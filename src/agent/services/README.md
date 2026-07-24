# Agent services

NestJS services that orchestrate routing, gate evaluation, LLM calls, and response assembly for the TripNARA agent pipeline. Implementation files live alongside this README under `src/agent/services/`.

---

## Testing and decision benchmarks

The **Guardians debate engine** (deterministic-shadow-debate, or DSD) runs a multi-persona pass over gate output to surface travel risks and trade-offs. For acceptance criteria and manual-audit benchmarks (Tibet, Iceland, Norway), see:

[Decision benchmarks: guardians debate engine](../../../docs/testing/guardians-debate-benchmarks.md)

That document covers core conflict expectations, persona-aligned behaviors under extreme weather and terrain, and what to check in logs and `guardian_results` fields.
