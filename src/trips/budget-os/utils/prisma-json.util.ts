import { Prisma } from '@prisma/client';

/** Cast domain objects for Prisma JSON columns. */
export function toInputJsonValue<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}
