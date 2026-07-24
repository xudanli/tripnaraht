/**
 * Corridor adapter contract — delegates to existing executors.
 * Gateway never unifies mixed writers into one store.
 */

import type {
  AuthoritativeWriteCommand,
  AuthoritativeWriteResult,
} from './authoritative-write.types';

export type AuthoritativeWriteHandler = (
  command: AuthoritativeWriteCommand,
) => Promise<AuthoritativeWriteResult>;

export type AuthoritativeWriteHandlerRegistry = Partial<
  Record<AuthoritativeWriteCommand['corridor'], AuthoritativeWriteHandler>
>;
