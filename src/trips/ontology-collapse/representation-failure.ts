/**
 * Any attempt to reify structure into a portable representation throws — stability is not encodable here.
 */
export function tryRepresent(_structure: unknown): never {
  throw new Error('ONTOLOGY_COLLAPSE: representation unstable');
}
