/**
 * 权重学习历史实体
 * 
 * 专利实现：记录权重学习过程，支持可追溯性和 Regret 分析
 * 参考：docs/DECISION_OS_EXPERT_TEAM_SPEC.md 2.5
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ObjectiveFunctionWeights } from '../../objective-function.interface';

@Entity('weight_learning_history')
@Index(['userId'])
@Index(['createdAt'])
@Index(['userId', 'createdAt'])
export class WeightLearningHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 255 })
  userId: string;

  @Column({ name: 'trip_id', type: 'varchar', length: 255, nullable: true })
  tripId: string | null;

  @Column({ name: 'weights_before', type: 'jsonb' })
  weightsBefore: ObjectiveFunctionWeights;

  @Column({ name: 'weights_after', type: 'jsonb' })
  weightsAfter: ObjectiveFunctionWeights;

  @Column({ name: 'feedback_data', type: 'jsonb', nullable: true })
  feedbackData: Record<string, unknown> | null;

  @Column({ name: 'learning_method', type: 'varchar', length: 50, nullable: true })
  learningMethod: string | null;

  @Column({ name: 'learning_rate', type: 'float', nullable: true })
  learningRate: number | null;

  @Column({ type: 'float', nullable: true })
  confidence: number | null;

  @Column({ name: 'utility_before', type: 'float', nullable: true })
  utilityBefore: number | null;

  @Column({ name: 'utility_after', type: 'float', nullable: true })
  utilityAfter: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
