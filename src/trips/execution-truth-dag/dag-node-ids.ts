/** Shared node id helpers — must stay aligned with `build-execution-truth-dag` */

export function nodeIdForSlot(slotId: string): string {
  return `exec:${slotId}`;
}

export function slotIdFromNodeId(nodeId: string): string {
  return nodeId.startsWith('exec:') ? nodeId.slice('exec:'.length) : nodeId;
}
