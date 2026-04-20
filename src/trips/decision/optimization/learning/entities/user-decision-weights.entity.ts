/**
 * 用户决策权重实体
 * 
 * 专利实现：持久化用户学习权重，支持策略学习 π_θ(a|s)
 * 参考：docs/DECISION_OS_EXPERT_TEAM_SPEC.md 2.5
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ObjectiveFunctionWeights } from '../../objective-function.interface';

@Entity('user_decision_weights')
@Index(['userId'], { unique: true })
export class UserDecisionWeightsEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'varchar', length: 255 })
  userId!: string;

  @Column({ type: 'jsonb' })
  weights!: ObjectiveFunctionWeights;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ name: 'learning_confidence', type: 'float', default: 0.5 })
  learningConfidence!: number;

  @Column({ name: 'total_feedback', type: 'int', default: 0 })
  totalFeedback!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
