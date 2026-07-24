/**
 * State P1：conversation_context 滑动窗口 SSOT 契约。
 * 禁止在 route_and_run 链路对 recent_messages 手写 slice(-N)；应走 ContextSlidingWindowAdapter / util。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CONTEXT_PROFILES } from '../context/interfaces/context-window-profile.interface';

const SCAN_ROOTS = [
  'src/agent/services',
  'src/agent/execution',
  'src/agent/runtime',
  'src/agent/utils',
];

const FORBIDDEN = /recent_messages[^;\n]{0,80}\.slice\s*\(\s*-/;

describe('conversation_context window SSOT contract', () => {
  it('documents canonical profile limits', () => {
    expect(CONTEXT_PROFILES.default.limit).toBe(10);
    expect(CONTEXT_PROFILES.orchestrator_claude.limit).toBe(16);
  });

  it('route_and_run consumers do not hardcode recent_messages.slice(-N)', () => {
    const offenders: string[] = [];
    for (const rel of SCAN_ROOTS) {
      const abs = path.join(process.cwd(), rel);
      if (!fs.existsSync(abs)) continue;
      walk(abs, (file) => {
        if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) return;
        const text = fs.readFileSync(file, 'utf8');
        if (FORBIDDEN.test(text)) {
          offenders.push(path.relative(process.cwd(), file));
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

function walk(dir: string, onFile: (file: string) => void): void {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, onFile);
    else onFile(full);
  }
}
