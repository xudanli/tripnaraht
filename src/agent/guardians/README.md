# Runtime Guardians（概念入口）

本目录是 **Agent Runtime Defensive Core v2.0** 的**稳定别名**；实现代码仍在 [`../axioms/`](../axioms/README.md)。

```typescript
// 推荐（新代码）
import { matchAxioms, pickDominantAxiom } from '../guardians';

// 等价（既有代码，无需批量改动）
import { matchAxioms } from '../axioms/axiom-matchers';
```

架构定夺见：[`docs/decision/ADR-AGENT-RUNTIME-GUARDIANS-V2.md`](../../../docs/decision/ADR-AGENT-RUNTIME-GUARDIANS-V2.md)。
