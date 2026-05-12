# Execution Algebra Spec v1

**Path:** `src/agent/runtime/specs/execution-algebra.spec.md`  
**Role:** Formal semantics for the **closed** trace → normalize → compare stack. **Not** an ABI (see `semantic-validation-contract.md`). **Not** a runtime or Nest contract.**Optional reads（零代码解释层）：**

- Categorical presentation — `execution-category-model.md`
- Rewrite-system presentation — `execution-rewrite-system.md`
- Judgment / typing presentation — `execution-proof-system.md`
- Surface syntax / eval mapping — `execution-dsl.md`
- Compiler pipeline architecture — `execution-compiler-architecture.md`
- Reverse synthesis (`RC`, selection) — `execution-reverse-compiler.md`
- Unified field / geometry presentation — `execution-semantics-unified-field.md`
- EPL (language of execution geometry) — `execution-epl.md`
- Contract governance (what may change) — `execution-contract-governance.md`
- ESGK adjudication shell — `execution-system-governance-kernel.md`
- EGI (human / AI / runtime interface) — `execution-governance-interface.md`
- ESP (Editor / Explorer / Console product loop) — `execution-system-productization.md`
- MVP platform (3 pages + 1 chain) — `execution-platform-mvp.md`
- Delivery engineering plan (milestones, risks) — `execution-platform-delivery-plan.md`

---

## §0. Scope

**This document defines:**

- Semantic objects (sorts) for the **orchestration execution trace** algebra
- Transform and comparison operators (`normalize`, `≡`, `~`, `FP`)
- **Composition** `⊕` (v1: **partial** on traces; see §13)
- The equivalence relation and fixed-point **relational** predicate induced by normalization

**Out of scope:**

- Runtime implementation details (Nest wiring, gateways, IO)
- Storage, ledger governance, router admission (covered elsewhere in `semantic-validation-contract.md`)
- **§1 validation graph** / timeline event algebra (`NormalizedSemanticTimelineEvents`, golden-path topology) — orthogonal layer; only referenced where boundaries must not be crossed

---

## §1. Sorts (semantic objects)

### 1.1 `ExecutionTrace`

Any value **lawfully** inhabiting the §16 orchestration trace schema:

- **Implementation:** `OrchestrationExecutionTraceV1` (`orchestration-execution-trace-v1.types.ts`)
- **v1 payload:** identity fields, `selection_reason`, `route_decision_path`, `runtime_hint`, schema/version constants — **not** a full “route selector / chain span **event** stream” inside this slice. If the §16 ABI later embeds span graphs, this sort’s definition **extends** without changing the operators’ names; laws must be re-checked.

### 1.2 `CanonicalExecutionTrace`

The result of **`normalize(ExecutionTrace)`** (see §2.1):

- **Implementation:** `CanonicalExecutionTraceV1` (`canonical-execution-trace-v1.types.ts`)
- **Intent:** remove observation noise that is excluded from semantic identity (v1: `runtime_hint` absent from canonical); stabilize structural encoding (sorted stable JSON); **no** enrichment

### 1.3 Model snapshot descriptor (`SemanticModelSnapshotDescriptor`)

Model **identity** metadata used outside this file’s core operators but part of the broader execution semantics stack:

- **Fields:** `executionModelVersion`, `schemaId`, `contractRevision`, `fingerprint`
- **Implementation:** `semantic-model-snapshot-descriptor.ts` (contract §10)

---

## §2. Operators

### 2.1 `normalize`

**Type:** `normalize : ExecutionTrace → CanonicalExecutionTrace`

**Constraints (MUST):**

- **Deterministic:** same input → same output
- **No IO**
- **No runtime dependency** (pure function on the trace value)

**Implementation:** `ExecutionNormalizationKernel.normalizeExecutionTrace`

**Algebraic extension (for §3 L1):** On `CanonicalExecutionTrace`, define **`normalize` = identity** (spec-level only; TS API remains trace-typed). Then **`normalize(normalize(T)) = normalize(T)`** reads: first map trace to canonical, second apply identity on canonical.

### 2.2 Canonical equality `≡`

**Type:** `≡ : CanonicalExecutionTrace × CanonicalExecutionTrace → Boolean`

**Definition:**

`A ≡ B` **iff** `stableJson(A) == stableJson(B)` where `stableJson` is `JSON.stringify ∘ sortKeysDeep` (see `canonicalExecutionTraceStableJson`).

### 2.3 Trace equivalence `~`

**Type:** `~ : ExecutionTrace × ExecutionTrace → Boolean`

**Definition (valid §16 traces only for the implemented kernel):**

`A ~ B` **iff** `normalize(A) ≡ normalize(B)`

Invalid / non-§16-schema traces: **outside** the implemented relation (kernel returns `false`).

### 2.4 Fixed point `FP`

**Type:** `FP : ExecutionTrace × ExecutionTrace → Boolean`

**Definition (v1):**

`FP(A, B)` **iff** `A ~ B`

**Interpretation:** `FP` is a **relational** predicate on the **current pair** — not state, not forecasting.

**Implementation:** `SemanticFixedPointKernel.isFixedPointTraces` / `isFixedPointCanonical`; `ExecutionEquivalenceKernel.isSemanticallyEquivalent` **delegates** to `FP` on traces (v1 same extension).

### 2.5 Composition `⊕`

**Type (intended):** `⊕ : ExecutionTrace × ExecutionTrace ⇀ ExecutionTrace` (**partial**)

**v1 shipped operation:** **`compose` / `conflictFreeMerge`** — defined **iff** `A ~ B`; result is the **left** operand `A` (deterministic representative in the class). **Not** a merge of differing semantics.

**Reserved (undefined in v1 API):** `sequentialCompose`, `overlayCompose` return **no result** (`null`) until §16 ABI carries ordered segments / overlay material without inventing roles.

**Implementation:** `execution-composition-kernel.ts` (`ExecutionCompositionKernel`)

---

## §3. Laws

| ID | Law | Statement |
|----|-----|-----------|
| **L1** | Normalization idempotence | `normalize(normalize(T)) = normalize(T)` with the §2.1 convention `normalize|_Canonical = id`. |
| **L2** | Equivalence consistency | `A ~ B` **iff** `normalize(A) ≡ normalize(B)`. |
| **L3** | Reflexivity | For all **valid** `A`, `A ~ A`. |
| **L4** | Symmetry | `A ~ B` **iff** `B ~ A`. |
| **L5** | Fixed-point closure | `FP(A, B)` **iff** `A ~ B` (v1). |

**Transitivity** of `~` follows from `≡` being equality on `stableJson`.

### 3.1 Composition laws (v1, where `A ⊕ B` is defined)

| ID | Law | Statement |
|----|-----|-----------|
| **C1** | Congruence / class preservation | If `A ~ A′`, `B ~ B′`, and `A ~ B`, then `(A ⊕ B) ~ (A′ ⊕ B′)` when both sides defined (v1: all four in one class). |
| **C2** | No invention | `⊕` **must not** introduce schema fields or semantic roles absent from the §16 merge contract for that revision. |
| **C3** | Normalization closure | For defined `A ⊕ B`, **`normalize(A ⊕ B) ≡ normalize(A ⊕ B)`** (trivially); with §2.1 identity on canonical, **`normalize`** applied after `⊕` stays on the same canonical class as `normalize(A)` (v1 conflict-free: `A ⊕ B = A` and `A ~ B` ⇒ `normalize(A) ≡ normalize(B)`). |

**Associativity (same class):** When `A ~ B ~ C` and `⊕` is v1 conflict-free merge, **`(A ⊕ B) ⊕ C`** and **`A ⊕ (B ⊕ C)`** are both defined and **equivalent** to `A` (left-biased projection).

---

## §4. Canonicalization rules

Canonical forms **must** satisfy:

| ID | Rule | v1 implementation note |
|----|------|-------------------------|
| **R1** | **Structural ordering** | Object keys deep-sorted for `stableJson`. **`span_adjacency`** is **empty** until §16 carries spans; when populated, edges MUST be sorted deterministically (contract §22: e.g. `(parent, child)` lexicographic). |
| **R2** | **Identity compression** | `snapshot_id` → `snapshot_key` (trim). `model_fingerprint` → **normalized hex string** (trim + lowercase) for comparison — **not** re-hashed into a different digest unless the trace ABI changes and this spec bumps. |
| **R3** | **Noise elimination** | Remove: `runtime_hint` from canonical; timestamps / latency / debug logs when present **on the trace slice** — v1 formal slice does not carry them, so no-op until ABI extends. |

---

## §5. Execution model boundary

**Allowed inputs**

- `ExecutionTrace` validated as §16 `OrchestrationExecutionTraceV1` when using shipped kernels

**Forbidden inputs** (must not drive `normalize` / `~` / `FP`)

- Raw runtime request objects
- ALS / ambient context
- Logger events as substitute for trace
- Arbitrary non-§16 “span blobs” without an ABI revision

---

## §6. Determinism contract

`normalize` **must** be:

- A **pure** function
- **Deterministic**
- **Order-invariant** on inputs that are **semantically** the same trace value (field-level equality after §16 parsing); JSON key order in source objects must not affect `stableJson ∘ normalize`

---

## §7. Equivalence semantics

**Core rule:** Two executions are equivalent **iff** their canonical forms are equal (`~`).

**Implications:**

- No fuzzy matching
- No scoring
- No partial equivalence “degrees”

---

## §8. Fixed-point semantics

**Definition:** A pair `(A, B)` satisfies the fixed-point predicate when `FP(A, B) = true`.

**Interpretation:** Stable semantic identity **under normalization** — still a **pair** property, not a temporal limit or attractor.

---

## §9. System interpretation

This system presents **execution traces** (§16 slice) as elements of a **quotient** by the equivalence relation induced by normalization:

**`ExecutionTrace / ~`** where **`A ~ B` ⇔ `normalize(A) ≡ normalize(B)`**.

---

## §10. Non-goals (freeze clause)

This algebra **explicitly forbids** (without a new spec version **and** explicit deprecation text):

- Drift taxonomy expansion inside this relation
- Probabilistic equivalence
- Runtime-aware comparison in `~` / `FP`
- ML-based similarity scoring
- Dynamic / adaptive normalization strategies
- A **second** equivalence definition parallel to `~`
- **Composition:** execution heuristics, probabilistic merge, runtime-dependent `⊕`, ML fusion, adaptive routing as composition, or “dynamic schema evolution” **without** ABI + spec bump

---

## §11. Versioning rule

Any change that alters **`normalize`**, **`stableJson`**, the **extension** of `~` / `FP`, or the **domain / definition** of **`⊕`** **must**:

1. Bump **this spec** version / revision stamp below  
2. Either **preserve** the equivalence relation on the old domain or **document deprecation** of the old relation  
3. **Not** introduce a second, competing equivalence definition on the same sort

---

## §12. Final interpretation (quotient + composition, v1)

**Execution traces (§16) are algebraic objects modulo normalization equivalence; v1 composition is the partial left projection on equivalence classes (`⊕` = merge only when `~` already identifies operands).**

---

## §13. Composition algebra (v1 detail)

**System signature (engineering reading):** **`(S, normalize, ~, FP, ⊕)`** where `S` is the set of valid `ExecutionTrace` values.

**Three composition modes** (minimal taxonomy — **operational**, not drift):

| Mode | Meaning | v1 |
|------|---------|-----|
| **Sequential** | `A` then `B` as one trace value | **Undefined** (`sequentialCompose` → no result) until §16 encodes a total order or segment list without inventing roles. |
| **Overlay** | Structural overlay merge | **Undefined** (`overlayCompose` → no result) until ABI specifies overlay merge. |
| **Conflict-free merge** | Same semantic class | **Defined** iff `A ~ B`; `A ⊕ B := A` (left bias). |

**Quotient monoid intuition:** On each **equivalence class** `[A]_~`, v1 `⊕` acts as a **constant** binary operation (result always `A` when picking left representative from the first argument — **not** a free monoid on all traces). Extending to true sequential / overlay **monoid** structure requires a spec + ABI that defines total `⊕` and verifies associativity/unit on the enlarged domain.

---

**Spec revision:** `v1.1` · `2026-05-11` — composition layer (`⊕` partial, `ExecutionCompositionKernel`); prior `v1` clauses unchanged unless superseded above. Aligned with `semantic-validation-contract.md` §16–§23.
