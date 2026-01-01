// src/contact/dto/contact-message.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class ContactMessageResponseDto {
  @ApiProperty({ description: '消息ID', example: 'contact_msg_1234567890' })
  id!: string;

  @ApiProperty({ description: '成功标识', example: true })
  success!: boolean;

  @ApiProperty({ description: '响应消息', example: '消息发送成功' })
  message!: string;
}
