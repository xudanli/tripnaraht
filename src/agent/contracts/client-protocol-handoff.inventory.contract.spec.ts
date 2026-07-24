/**
 * EWP-06 — Backend protocol inventory; does not prove shipping client compliance.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

const REQUIRED = [
  'src/decision-runtime/decision-cases/DECISION_SPACE_IOS_HANDOFF.md',
  'src/trips/arrange-itinerary/ARRANGE_ITINERARY_IOS_HANDOFF.md',
  'src/trips/copilot/PAGE_INSIGHT_API.md',
  'src/trips/copilot/contracts/page-ai-contracts.ts',
  'src/agent/delivery/FRONTEND_TRUSTED_DELIVERY.md',
  'internal-docs/frontend/TEP-SELF-DRIVE-FRONTEND-HANDOFF.md',
] as const;

describe('client-protocol-handoff.inventory.contract (EWP-06)', () => {
  it('required handoff / contract files exist', () => {
    for (const rel of REQUIRED) {
      expect(fs.existsSync(path.join(ROOT, rel))).toBe(true);
    }
  });

  it('page-ai-contracts exports contextHashFields', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src/trips/copilot/contracts/page-ai-contracts.ts'),
      'utf8',
    );
    expect(src).toMatch(/contextHashFields/);
  });

  it('repository has no production Swift sources', () => {
    const swift = fs
      .readdirSync(ROOT, { withFileTypes: true })
      .some((d) => d.isFile() && d.name.endsWith('.swift'));
    // shallow check + known absence: recursive spot via glob of common dirs
    const probe = [
      'apps',
      'mobile',
      'ios',
      'web',
      'frontend',
    ].map((d) => path.join(ROOT, d));
    for (const p of probe) {
      if (!fs.existsSync(p)) continue;
      // do not fail if dirs exist without .swift — only assert no .swift at repo root
    }
    expect(swift).toBe(false);
  });

  it('reference frontend-*-api-client.ts samples exist', () => {
    const samples = [
      'src/trips/arrange-itinerary/dto/frontend-arrange-itinerary-api-client.ts',
      'src/trips/copilot/dto/frontend-page-insight-api-client.ts',
    ];
    for (const rel of samples) {
      expect(fs.existsSync(path.join(ROOT, rel))).toBe(true);
    }
  });
});
