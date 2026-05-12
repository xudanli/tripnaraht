import { Injectable } from '@nestjs/common';

@Injectable()
export class AccessTrackerService {
  private readonly counts = new Map<string, number>();
  private readonly lastValues = new Map<string, unknown>();

  inc(key: string, by = 1): void {
    const k = String(key ?? '');
    if (!k) return;
    const cur = this.counts.get(k) ?? 0;
    this.counts.set(k, cur + (Number.isFinite(by) ? by : 1));
  }

  get(key: string): number {
    return this.counts.get(String(key ?? '')) ?? 0;
  }

  setValue<T = unknown>(key: string, value: T): void {
    const k = String(key ?? '');
    if (!k) return;
    this.lastValues.set(k, value);
  }

  getValue<T = unknown>(key: string): T | undefined {
    return this.lastValues.get(String(key ?? '')) as T | undefined;
  }

  snapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of this.counts.entries()) out[k] = v;
    return out;
  }

  reset(): void {
    this.counts.clear();
    this.lastValues.clear();
  }
}

