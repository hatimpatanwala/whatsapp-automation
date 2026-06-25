import { Global, Module } from '@nestjs/common';
import { PlatformConfigService } from './platform-config.service';

/**
 * Global so any module (auth/OAuth, embedded signup, super-admin) can inject
 * PlatformConfigService without importing this module explicitly.
 */
@Global()
@Module({
  providers: [PlatformConfigService],
  exports: [PlatformConfigService],
})
export class PlatformConfigModule {}
