# Agentic Provider HTTP API

> **Base:** `/api/decision-engine/v1/providers/*`  
> **Authority:** Advisory only — structured artifacts, no formal decision authority.

## Endpoints

### Research

```http
POST /api/decision-engine/v1/providers/research
Content-Type: application/json

{
  "tripId": "trip_abc",
  "query": "optional research question",
  "state": { }
}
```

Response: `tripnara.research_provider_result@v1`

### Narration

```http
POST /api/decision-engine/v1/providers/narration
Content-Type: application/json

{
  "tripId": "trip_abc",
  "plan": { "days": [] },
  "decisionRecordId": "optional"
}
```

Response: `tripnara.narration_provider_result@v1`

### Critic

```http
POST /api/decision-engine/v1/providers/critic
Content-Type: application/json

{
  "tripId": "trip_abc",
  "plan": { "days": [] },
  "state": { }
}
```

Response: `tripnara.critic_provider_result@v1`

## Staging

```bash
npm run p5-agentic-providers:staging
npm run p5-agentic-providers:staging -- http://localhost:3000/api
```

## Registry

`GET /api/decision-engine/v1/runtime-capabilities` → `providerRegistry.providers[]` with `runtimeBound=true`.
