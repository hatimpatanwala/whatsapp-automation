import { Controller, Get, Post, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { PaymentService } from './payment.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('payments')
@UseGuards(TenantGuard)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get()
  @Roles('owner', 'seller')
  async findAll(@Req() req: Request, @Query('status') status?: string) {
    return this.paymentService.findAll(req.tenantContext.schemaName, status);
  }

  @Post(':id/verify')
  @Roles('owner', 'seller')
  async verify(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { transactionRef?: string },
  ) {
    const userId = (req.session as any).userId;
    return this.paymentService.verifyPayment(req.tenantContext.schemaName, id, userId, body.transactionRef);
  }

  @Post(':id/reject')
  @Roles('owner', 'seller')
  async reject(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.paymentService.rejectPayment(req.tenantContext.schemaName, id, body.reason);
  }
}
