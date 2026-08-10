import {
  isRfc001MetadataReadFallbackEnabled,
  isRfc001MetadataWriteEnabled,
  isRfc001TableReadPreferred,
  isRfc001TableWriteEnabled,
  resolveRfc001TableStorageMode,
} from './p2-rfc001-table-storage.config';
import { resolveRfc001TableStorageStatus } from './p2-rfc001-table-storage-status.util';

describe('P2 RFC-001 table storage config', () => {
  const prev = process.env.P2_RFC001_TABLE_STORAGE;

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.P2_RFC001_TABLE_STORAGE;
    } else {
      process.env.P2_RFC001_TABLE_STORAGE = prev;
    }
  });

  it('defaults to OFF', () => {
    delete process.env.P2_RFC001_TABLE_STORAGE;
    expect(resolveRfc001TableStorageMode()).toBe('OFF');
    expect(isRfc001TableWriteEnabled()).toBe(false);
    expect(isRfc001MetadataWriteEnabled()).toBe(true);
    expect(isRfc001TableReadPreferred()).toBe(false);
    expect(isRfc001MetadataReadFallbackEnabled()).toBe(true);
  });

  it('DUAL_WRITE writes both and reads metadata', () => {
    process.env.P2_RFC001_TABLE_STORAGE = 'DUAL_WRITE';
    expect(isRfc001TableWriteEnabled()).toBe(true);
    expect(isRfc001MetadataWriteEnabled()).toBe(true);
    expect(isRfc001TableReadPreferred()).toBe(false);
  });

  it('TABLE_PRIMARY prefers table with metadata fallback', () => {
    process.env.P2_RFC001_TABLE_STORAGE = 'TABLE_PRIMARY';
    expect(isRfc001TableWriteEnabled()).toBe(true);
    expect(isRfc001MetadataWriteEnabled()).toBe(true);
    expect(isRfc001TableReadPreferred()).toBe(true);
    expect(isRfc001MetadataReadFallbackEnabled()).toBe(true);
  });

  it('TABLE_ONLY cuts metadata write/read fallback', () => {
    process.env.P2_RFC001_TABLE_STORAGE = 'TABLE_ONLY';
    expect(isRfc001TableWriteEnabled()).toBe(true);
    expect(isRfc001MetadataWriteEnabled()).toBe(false);
    expect(isRfc001TableReadPreferred()).toBe(true);
    expect(isRfc001MetadataReadFallbackEnabled()).toBe(false);
  });

  it('status util exposes migration + tables', () => {
    process.env.P2_RFC001_TABLE_STORAGE = 'DUAL_WRITE';
    const status = resolveRfc001TableStorageStatus();
    expect(status.mode).toBe('DUAL_WRITE');
    expect(status.migration).toContain('rfc001_formal_storage');
    expect(status.tables).toContain('rfc001_plan_versions');
    expect(status.tables).toContain('rfc001_decision_workspaces');
  });
});
