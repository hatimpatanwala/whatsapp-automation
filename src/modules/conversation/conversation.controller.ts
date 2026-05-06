import { Controller, Get, Post, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ConversationService } from './conversation.service';
import { WhatsAppMessageService } from '../whatsapp/whatsapp-message.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('conversations')
@UseGuards(TenantGuard)
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly messageService: WhatsAppMessageService,
  ) {}

  @Get()
  @Roles('owner', 'seller', 'staff')
  async findAll(@Req() req: Request, @Query() pagination: PaginationDto) {
    return this.conversationService.findAll(req.tenantContext.schemaName, pagination);
  }

  @Get(':id/messages')
  @Roles('owner', 'seller', 'staff')
  async getMessages(@Req() req: Request, @Param('id') id: string, @Query() pagination: PaginationDto) {
    return this.conversationService.getMessages(req.tenantContext.schemaName, id, pagination);
  }

  @Post(':id/send')
  @Roles('owner', 'seller', 'staff')
  async sendReply(@Req() req: Request, @Param('id') id: string, @Body() body: { text: string }) {
    const { phone } = await this.conversationService.sendManualReply(
      req.tenantContext.schemaName, id, body.text,
    );

    await this.messageService.logAndSendText(
      req.tenantContext.schemaName,
      req.tenantContext.phoneNumberId,
      req.tenantContext.accessToken,
      phone,
      id,
      body.text,
    );

    return { message: 'Reply sent' };
  }
}
