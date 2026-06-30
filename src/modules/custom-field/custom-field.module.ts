import { Module } from '@nestjs/common';
import { CustomFieldController } from './custom-field.controller';
import { OnboardingWebviewController } from './onboarding-webview.controller';
import { CustomFieldService } from './custom-field.service';
import { BuilderModule } from '../builder/builder.module';

@Module({
  imports: [BuilderModule],
  controllers: [CustomFieldController, OnboardingWebviewController],
  providers: [CustomFieldService],
  exports: [CustomFieldService],
})
export class CustomFieldModule {}
