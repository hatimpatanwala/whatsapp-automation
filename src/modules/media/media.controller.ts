import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { MediaService } from './media.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('media')
@UseGuards(TenantGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @Roles('owner', 'seller')
  async getUploadUrl(
    @Req() req: Request,
    @Body() body: { fileName: string; contentType: string },
  ) {
    return this.mediaService.getPresignedUploadUrl(
      req.tenantContext.schemaName,
      body.fileName,
      body.contentType,
    );
  }
}
