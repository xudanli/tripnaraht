import { BadRequestException } from '@nestjs/common';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertValidPostId(postId: string): void {
  if (!UUID_RE.test(postId)) {
    throw new BadRequestException('无效的招募帖 ID');
  }
}
