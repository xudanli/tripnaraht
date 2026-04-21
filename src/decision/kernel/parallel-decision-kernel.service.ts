import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ParallelDecisionKernel } from './parallel-decision-kernel';

@Injectable()
export class ParallelDecisionKernelService implements OnModuleDestroy {
  readonly kernel: ParallelDecisionKernel;

  constructor() {
    // Singleton kernel instance shared across requests.
    this.kernel = new ParallelDecisionKernel();
  }

  async onModuleDestroy(): Promise<void> {
    await this.kernel.close();
  }
}

