import { Controller, Get, Post, Param, Body, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { ConversationService } from './conversation.service';
import { WhatsAppMessageService } from '../whatsapp/whatsapp-message.service';
import { MetaTokenService } from '../waba/meta-token.service';
import { PhoneNumberService } from '../waba/phone-number.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('conversations')
@UseGuards(TenantGuard)
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly messageService: WhatsAppMessageService,
    private readonly metaTokenService: MetaTokenService,
    private readonly phoneService: PhoneNumberService,
  ) {}

  @Get('stats')
  @Roles('owner', 'seller')
  async getStats(@Req() req: Request) {
    return this.conversationService.getStats(req.tenantContext.schemaName);
  }

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
    const ctx = req.tenantContext;
    if (!body?.text?.trim()) {
      throw new BadRequestException('Message text is required.');
    }

    const { phone } = await this.conversationService.sendManualReply(ctx.schemaName, id, body.text);

    // Resolve usable credentials. For multi-WABA tenants the access token lives
    // in meta_tokens (encrypted), not on the tenant row — so tenantContext
    // .accessToken is empty and we must look it up via the assigned number's WABA.
    let phoneNumberId = ctx.phoneNumberId;
    let accessToken = ctx.accessToken;
    if (!phoneNumberId || !accessToken) {
      const phoneRecord = phoneNumberId
        ? await this.phoneService.findByPhoneNumberId(phoneNumberId)
        : await this.phoneService.findByTenantId(ctx.id);
      if (phoneRecord) {
        phoneNumberId = phoneNumberId || phoneRecord.phoneNumberId;
        if (!accessToken && phoneRecord.wabaAccountId) {
          accessToken = await this.metaTokenService
            .getActiveToken(phoneRecord.wabaAccountId)
            .catch(() => '');
        }
      }
    }

    if (!phoneNumberId || !accessToken) {
      throw new BadRequestException(
        'Your WhatsApp number is not fully connected yet, so the reply could not be sent.',
      );
    }

    try {
      await this.messageService.logAndSendText(ctx.schemaName, phoneNumberId, accessToken, phone, id, body.text);
    } catch (err: any) {
      // Surface Meta's reason (e.g. outside the 24-hour customer service window).
      throw new BadRequestException(
        err?.message || 'WhatsApp could not deliver the message. Please try again.',
      );
    }

    return { message: 'Reply sent' };
  }
}
