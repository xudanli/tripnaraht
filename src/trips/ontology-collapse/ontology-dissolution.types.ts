/**
 * P26 — Formal ontology collapse: no symbolic scaffolding; only recurrent consistency in observation.
 */

/**
 * Uninhabited frame — `never` marks dimensions along which no ontology can be consistently expressed.
 * Assignability via assertion only; this is intentional.
 */
export interface OntologyFrame {
  entities: never;
  relations: never;
  rules: never;
  representations: never;
}

/** Raw dynamics without semantic typing — scalar trace only. */
export interface RawObservation {
  tick: number;
  signal: number;
}

export interface RegularityPattern {
  /** Opaque recurrence key — not a “name”, only a stabilizing fingerprint. */
  fingerprint: string;
  tickStart: number;
  tickEnd: number;
}

export interface ConsistencyObservation {
  pattern: RegularityPattern;
  /** Deliberately non-encodable — stable description collapses. */
  description: null;
}

export interface LinguaFragment {
  label?: string;
  semantics?: string;
  /** Residual scalar trace that survives one language decay step. */
  trace?: number;
}

export interface InvariantFlow {
  fingerprint: string;
  tickStart: number;
  tickEnd: number;
  selfSustaining: boolean;
}
