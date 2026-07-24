import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserMemoryConsoleService } from './user-memory-console.service';
import type { MemoryService } from '../services/memory.service';

describe('UserMemoryConsoleService', () => {
  const memoryService = {
    getUserTravelProfile: jest.fn(),
    getUserRouteDirectionDecisions: jest.fn().mockResolvedValue([]),
    saveUserTravelProfile: jest.fn(),
    deleteRouteDirectionDecision: jest.fn(),
  } as unknown as jest.Mocked<MemoryService>;

  const configOn = { get: (k: string) => (k === 'FEATURE_MEMORY_CONSOLE' ? '1' : undefined) } as ConfigService;

  let service: UserMemoryConsoleService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UserMemoryConsoleService(memoryService, undefined, undefined, configOn);
  });

  it('deleteL2Decision calls MemoryService and succeeds', async () => {
    (memoryService.deleteRouteDirectionDecision as jest.Mock).mockResolvedValue(true);
    await service.deleteL2Decision('user-1', 'dec-abc');
    expect(memoryService.deleteRouteDirectionDecision).toHaveBeenCalledWith('user-1', 'dec-abc');
  });

  it('deleteL2Decision throws 6003 when not found', async () => {
    (memoryService.deleteRouteDirectionDecision as jest.Mock).mockResolvedValue(false);
    await expect(service.deleteL2Decision('user-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
