/**
 * DSO 快照实体
 * 
 * 专利实现：STATE_UPDATE 后的 DSO 快照，支持回滚和审计
 * 参考：1.5 STATE_UPDATE 同步机制
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('dso_snapshots')
@Index(['requestId'])
@Index(['requestId', 'version'], { unique: true })
@Index(['createdAt'])
export class DSOSnapshotEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'request_id', type: 'varchar', length: 255 })
  requestId: string;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'varchar', length: 50 })
  phase: string;

  @Column({ name: 'dso_data', type: 'jsonb' })
  dsoData: Record<string, unknown>;

  @Column({ name: 'confidence', type: 'float', nullable: true })
  confidence: number | null;

  @Column({ name: 'lyapunov_value', type: 'float', nullable: true })
  lyapunovValue: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
