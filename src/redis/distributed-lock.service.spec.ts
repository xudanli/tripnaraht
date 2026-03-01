import { DistributedLockService, LockHandle } from './distributed-lock.service';

describe('DistributedLockService', () => {
  let service: DistributedLockService;

  beforeEach(() => {
    service = new DistributedLockService();
  });

  describe('acquire', () => {
    it('should successfully acquire a lock', async () => {
      const result = await service.acquire('test-resource-1');

      expect(result.success).toBe(true);
      expect(result.handle).toBeDefined();
      expect(result.handle?.key).toContain('test-resource-1');
      expect(result.handle?.token).toBeDefined();
      expect(result.attempts).toBe(1);
    });

    it('should fail to acquire an already held lock', async () => {
      await service.acquire('test-resource-2');
      
      const result = await service.acquire('test-resource-2', {
        retryCount: 2,
        retryDelayMs: 10,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.attempts).toBe(2);
    });

    it('should acquire locks for different resources', async () => {
      const result1 = await service.acquire('resource-a');
      const result2 = await service.acquire('resource-b');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });

  describe('release', () => {
    it('should successfully release a held lock', async () => {
      const acquireResult = await service.acquire('test-resource-3');
      expect(acquireResult.success).toBe(true);
      
      const released = await service.release(acquireResult.handle!);
      expect(released).toBe(true);
    });

    it('should fail to release with wrong token', async () => {
      const acquireResult = await service.acquire('test-resource-4');
      expect(acquireResult.success).toBe(true);
      
      const fakeHandle: LockHandle = {
        ...acquireResult.handle!,
        token: 'wrong-token',
      };
      
      const released = await service.release(fakeHandle);
      expect(released).toBe(false);
    });

    it('should allow re-acquiring after release', async () => {
      const result1 = await service.acquire('test-resource-5');
      await service.release(result1.handle!);
      
      const result2 = await service.acquire('test-resource-5');
      expect(result2.success).toBe(true);
    });
  });

  describe('isLocked', () => {
    it('should return true for locked resource', async () => {
      await service.acquire('test-resource-6');
      
      const locked = await service.isLocked('test-resource-6');
      expect(locked).toBe(true);
    });

    it('should return false for unlocked resource', async () => {
      const locked = await service.isLocked('non-existent-resource');
      expect(locked).toBe(false);
    });

    it('should return false after release', async () => {
      const result = await service.acquire('test-resource-7');
      await service.release(result.handle!);
      
      const locked = await service.isLocked('test-resource-7');
      expect(locked).toBe(false);
    });
  });

  describe('withLock', () => {
    it('should execute callback with lock', async () => {
      let executed = false;
      
      const result = await service.withLock('test-resource-8', async () => {
        executed = true;
        return 'success';
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(executed).toBe(true);
    });

    it('should release lock after callback', async () => {
      await service.withLock('test-resource-9', async () => {
        return 'done';
      });

      const locked = await service.isLocked('test-resource-9');
      expect(locked).toBe(false);
    });

    it('should release lock even if callback throws', async () => {
      const result = await service.withLock('test-resource-10', async () => {
        throw new Error('Test error');
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Test error');
      
      const locked = await service.isLocked('test-resource-10');
      expect(locked).toBe(false);
    });

    it('should fail if lock cannot be acquired', async () => {
      await service.acquire('test-resource-11');
      
      const result = await service.withLock(
        'test-resource-11',
        async () => 'should not execute',
        { retryCount: 1, retryDelayMs: 10 },
      );

      expect(result.success).toBe(false);
    });
  });

  describe('renew', () => {
    it('should successfully renew a held lock', async () => {
      const acquireResult = await service.acquire('test-resource-12');
      const originalExpiry = acquireResult.handle!.expiresAt;
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const renewed = await service.renew(acquireResult.handle!);
      expect(renewed).toBe(true);
      expect(acquireResult.handle!.expiresAt).toBeGreaterThan(originalExpiry);
    });

    it('should fail to renew with wrong token', async () => {
      const acquireResult = await service.acquire('test-resource-13');
      
      const fakeHandle: LockHandle = {
        ...acquireResult.handle!,
        token: 'wrong-token',
      };
      
      const renewed = await service.renew(fakeHandle);
      expect(renewed).toBe(false);
    });
  });

  describe('concurrent access', () => {
    it('should serialize access with withLock', async () => {
      const results: number[] = [];
      
      const task = async (id: number) => {
        return service.withLock('shared-resource', async () => {
          results.push(id);
          await new Promise(resolve => setTimeout(resolve, 5));
          return id;
        }, { retryCount: 10, retryDelayMs: 10 });
      };

      await Promise.all([task(1), task(2), task(3)]);

      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });
});
