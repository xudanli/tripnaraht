import { ReactSystemPromptService } from './react-system-prompt.service';
import { ActionRegistryService } from './action-registry.service';

describe('ReactSystemPromptService (dynamic tool masking)', () => {
  it('removes drive-related tool schemas when forbidden_modes includes DRIVE', () => {
    const registry = new ActionRegistryService();
    // Register a fake drive tool + a safe tool.
    registry.register({
      name: 'transport.drive_navigation',
      description: 'Drive navigation tool (should be masked)',
      metadata: {
        kind: 'internal' as any,
        cost: 'low' as any,
        side_effect: 'none' as any,
        preconditions: [],
        idempotent: true,
        cacheable: false,
      },
      input_schema: { type: 'object', properties: {} },
      output_schema: { type: 'object', properties: {} },
      execute: async () => ({}),
    } as any);
    registry.register({
      name: 'places.resolve_entities',
      description: 'Resolve places (should remain)',
      metadata: {
        kind: 'internal' as any,
        cost: 'low' as any,
        side_effect: 'none' as any,
        preconditions: [],
        idempotent: true,
        cacheable: false,
      },
      input_schema: { type: 'object', properties: {} },
      output_schema: { type: 'object', properties: {} },
      execute: async () => ({}),
    } as any);

    const svc = new ReactSystemPromptService(registry);
    const prompt = svc.generateSystemPrompt({
      includeToolSchemas: true,
      emergencyConstraints: { forbidden_modes: ['DRIVE'] },
    });

    expect(prompt).not.toContain('transport.drive_navigation');
    expect(prompt).toContain('places.resolve_entities');
  });
});

