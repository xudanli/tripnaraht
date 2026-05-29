import {
  enrichSseProgressWithCanvasHint,
  resolveCanvasRenderHintForPhase,
} from './golden-path-sse-canvas-contract.util';
import {
  WORLD_UI_LAYER_DIFF_STREAM,
  WORLD_UI_LAYER_MAP,
  WORLD_UI_LAYER_NARRATIVE,
} from '../../world/world-editing-ui-paradigm';

describe('golden-path-sse-canvas-contract', () => {
  it('maps RESEARCH to MAP layer with glow stream', () => {
    const hint = resolveCanvasRenderHintForPhase('RESEARCH');
    expect(hint?.active_layers).toContain(WORLD_UI_LAYER_MAP);
    expect(hint?.glow_stream_active).toBe(true);
  });

  it('maps DONE to DIFF_STREAM + NARRATIVE without glow', () => {
    const hint = resolveCanvasRenderHintForPhase('DONE');
    expect(hint?.active_layers).toContain(WORLD_UI_LAYER_DIFF_STREAM);
    expect(hint?.active_layers).toContain(WORLD_UI_LAYER_NARRATIVE);
    expect(hint?.glow_stream_active).toBe(false);
  });

  it('enrichSseProgressWithCanvasHint attaches canvas_render to payload', () => {
    const enriched = enrichSseProgressWithCanvasHint({
      task_id: 't1',
      request_id: 'r1',
      type: 'PHASE',
      current_phase: 'NARRATE',
      progress_percentage: 80,
      message: 'narrating',
      status: 'PROCESSING',
      ts: new Date().toISOString(),
    });
    expect(enriched.canvas_render?.active_layers).toContain(WORLD_UI_LAYER_NARRATIVE);
  });
});
