import { ConflictException } from '@nestjs/common';

export class StructureOverflowException extends ConflictException {
  constructor(
    public readonly structureTotal: number,
    public readonly newTotal: number,
  ) {
    super({
      code: 'STRUCTURE_OVERFLOW',
      message: '分类结构总和超过新总预算',
      structureTotal,
      newTotal,
    });
  }
}
