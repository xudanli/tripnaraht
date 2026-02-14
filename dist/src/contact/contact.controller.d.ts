import { Request } from 'express';
import { ContactService, MulterFile } from './services/contact.service';
import { StandardResponse } from '../common/dto/standard-response.dto';
import { ContactMessageResponseDto } from './dto/contact-message.dto';
import { GetContactMessagesQueryDto, UpdateContactMessageStatusDto, ReplyContactMessageDto } from './dto/admin-contact.dto';
export declare class ContactController {
    private readonly contactService;
    constructor(contactService: ContactService);
    sendMessage(body: {
        message?: string;
    }, files: MulterFile[] | undefined, req: Request): Promise<StandardResponse<ContactMessageResponseDto>>;
    getContactMessages(query: GetContactMessagesQueryDto): Promise<StandardResponse<any>>;
    getContactMessageById(messageId: string): Promise<StandardResponse<any>>;
    updateContactMessageStatus(messageId: string, dto: UpdateContactMessageStatusDto): Promise<StandardResponse<any>>;
    replyContactMessage(messageId: string, dto: ReplyContactMessageDto): Promise<StandardResponse<any>>;
}
