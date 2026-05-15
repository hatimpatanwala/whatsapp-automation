import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { SubscriptionPlanService } from './subscription-plan.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

@Controller()
export class SubscriptionPlanController {
  constructor(private readonly planService: SubscriptionPlanService) {}

  // ─── Super Admin endpoints ─────────────────────────────────────────────

  @Get('admin/plans')
  @Roles('admin', 'support')
  async findAll() {
    return this.planService.findAll(true);
  }

  @Get('admin/plans/:id')
  @Roles('admin', 'support')
  async findOne(@Param('id') id: string) {
    return this.planService.findById(id);
  }

  @Post('admin/plans')
  @Roles('admin')
  async create(@Body() dto: CreatePlanDto) {
    return this.planService.create(dto);
  }

  @Patch('admin/plans/:id')
  @Roles('admin')
  async update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.planService.update(id, dto);
  }

  @Delete('admin/plans/:id')
  @Roles('admin')
  async delete(@Param('id') id: string) {
    return this.planService.delete(id);
  }

  // ─── Public endpoint (for pricing/upgrade pages) ───────────────────────

  @Get('plans')
  @Public()
  async getPublicPlans() {
    return this.planService.getPublicPlans();
  }
}
