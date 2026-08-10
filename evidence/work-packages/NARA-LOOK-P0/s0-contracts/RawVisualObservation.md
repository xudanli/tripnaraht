# Contract — RawVisualObservation (+ Model I/O)

**Status:** FROZEN candidate (S2 implemented 2026-07-25)  
**Layer:** Extraction only — **no** trip decisions, **no** write commands

---

## Input

```ts
interface ObservationModelInput {
  images: MediaReference[]; // signed URL or mediaRef resolve

  intent:
    | 'CHECK_VEHICLE'
    | 'CHECK_ROAD'
    | 'CHECK_ACTIVITY_ENTRY';

  userQuestion?: string;

  hints: {
    expectedRoadId?: string;
    expectedVehicleType?: string;
    expectedOperatorName?: string;
  };
}
```

Hints are **soft priors**. Model must not treat them as ground truth.

---

## Output (Schema-required)

```ts
interface BoundingBox {
  x: number; y: number; w: number; h: number; // normalized 0..1 preferred
}

interface RawVisualObservation {
  sceneType:
    | 'VEHICLE'
    | 'ROAD_ENTRY'
    | 'ROAD_SIGN'
    | 'ACTIVITY_ENTRY'
    | 'UNKNOWN';

  detectedObjects: Array<{
    type: string;
    subtype?: string;
    confidence: number;
    boundingBox?: BoundingBox;
  }>;

  recognizedText: Array<{
    text: string;
    confidence: number;
    boundingBox?: BoundingBox;
  }>;

  extractedFacts: Array<{
    key: string;      // pre-ontology keys; mapper → Semantic Keys
    value: unknown;
    confidence: number;
  }>;

  uncertainties: string[];
  requiredAdditionalViews: string[]; // drives recapture sheet
}
```

All provider outputs **must** pass JSON Schema validation. Fail → `MODEL_FAILED` or treat as empty facts + recapture, **never** free-text substitute assessment.

---

## Forbidden model outputs

Providers / prompts must refuse or strip:

- “这条道路安全 / 你可以继续开”
- “一定是四驱”
- “活动已取消”
- “不需要遵守官方标志”
- “直接进入即可”
- Any itinerary mutation / Command payload
- Emotion / health / identity document conclusions beyond privacy flags

---

## Uncertainty → pipeline

Enter recapture or `UNKNOWN` when **any** of:

- Critical field confidence below threshold (thresholds TBD in S0-CS; propose defaults below)  
- OCR cannot read road id when intent is `CHECK_ROAD`  
- GPS accuracy insufficient for intent  
- Capture vs upload time anomaly  
- Vision vs official conflict (after grounding)  
- Drivetrain unknown when needed for F-road fit  
- Booking missing for activity entry  
- Obvious occlusion

### Proposed confidence defaults (CS to confirm)

| Field | Min confidence to emit fact |
|-------|-----------------------------|
| Road id OCR | 0.75 |
| Vehicle model / badge OCR | 0.70 |
| Drivetrain inference from image | 0.85 (else UNKNOWN + recapture) |
| Operator / entry sign | 0.70 |
| Generic object presence | 0.60 |

---

## Ontology map

`extractedFacts` → `TravelObservationEvent.observations[]` via  
`observation-ontology.mapper` using frozen Semantic Keys only.  
Unknown keys are dropped + logged; they must not reach assessment.
