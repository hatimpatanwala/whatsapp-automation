import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Tenant } from '../../database/entities/public/tenant.entity';

export interface PhoneCheckResult {
  phone: string;
  hasWhatsApp: boolean;
  hasWhatsAppBusiness: boolean;
  canAutoSetup: boolean;
  message: string;
}

export interface ConnectWhatsAppDto {
  phone: string;
  phoneNumberId: string;
  wabaId: string;
  accessToken: string;
  webhookSecret?: string;
}

export interface BusinessProfileDto {
  businessName: string;
  businessCategory: string;
  businessDescription?: string;
  businessAddress?: string;
  logoUrl?: string;
}

/**
 * Onboarding status progression:
 *   pending → phone_verified → whatsapp_connected → profile_complete → completed
 */
export type OnboardingStep = 'pending' | 'phone_verified' | 'whatsapp_connected' | 'profile_complete' | 'completed';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly configService: ConfigService,
  ) {}

  async getStatus(tenantId: string) {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      select: [
        'id', 'onboardingStatus', 'whatsappPhone', 'phoneNumberId',
        'wabaId', 'businessName', 'businessCategory', 'businessDescription',
        'businessAddress', 'logoUrl',
      ],
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    return {
      currentStep: tenant.onboardingStatus as OnboardingStep,
      phone: tenant.whatsappPhone || null,
      hasWhatsAppConfig: !!tenant.phoneNumberId && !!tenant.wabaId,
      businessName: tenant.businessName || null,
      businessCategory: tenant.businessCategory || null,
      businessDescription: tenant.businessDescription || null,
      businessAddress: tenant.businessAddress || null,
      logoUrl: tenant.logoUrl || null,
    };
  }

  /**
   * Step 1: Verify the phone number and check WhatsApp Business availability.
   *
   * In production this would call Meta's Graph API to verify:
   *   GET https://graph.facebook.com/v21.0/{phone_number_id}
   *
   * Since we cannot actually call Meta without real credentials, we simulate
   * the check and provide guidance to the user.
   */
  async checkPhone(tenantId: string, phone: string): Promise<PhoneCheckResult> {
    // Normalize phone: strip spaces, dashes, ensure + prefix
    const normalized = phone.replace(/[\s\-()]/g, '');
    if (!/^\+?\d{10,15}$/.test(normalized)) {
      throw new BadRequestException('Invalid phone number format. Use international format, e.g. +91XXXXXXXXXX');
    }

    const fullPhone = normalized.startsWith('+') ? normalized : `+${normalized}`;

    // Save phone to tenant
    await this.tenantRepository.update(tenantId, {
      whatsappPhone: fullPhone,
      onboardingStatus: 'phone_verified',
    });

    // In a real implementation, we'd call Meta's API here:
    //   1. Check if phone is registered with WhatsApp Business API
    //   2. If yes, fetch phone_number_id and waba_id
    //   3. If no, check if it's a regular WhatsApp number
    //
    // For now, we return guidance that helps the user proceed.

    this.logger.log(`Phone check for tenant ${tenantId}: ${fullPhone}`);

    return {
      phone: fullPhone,
      hasWhatsApp: true, // assume the number has WhatsApp
      hasWhatsAppBusiness: false, // user needs to verify/connect manually
      canAutoSetup: false,
      message: 'Phone verified. Please connect your WhatsApp Business account or follow the setup guide.',
    };
  }

  /**
   * Step 2a: Connect existing WhatsApp Business API credentials.
   * The user provides their phone_number_id, waba_id, and access_token
   * obtained from Meta Business Suite.
   */
  async connectWhatsApp(tenantId: string, dto: ConnectWhatsAppDto) {
    if (!dto.phoneNumberId || !dto.wabaId || !dto.accessToken) {
      throw new BadRequestException('phoneNumberId, wabaId, and accessToken are all required');
    }

    // Verify the credentials by making a test API call to Meta
    const isValid = await this.verifyMetaCredentials(dto);

    await this.tenantRepository.update(tenantId, {
      phoneNumberId: dto.phoneNumberId,
      wabaId: dto.wabaId,
      accessToken: dto.accessToken,
      webhookSecret: dto.webhookSecret || null,
      whatsappPhone: dto.phone,
      onboardingStatus: 'whatsapp_connected',
    });

    this.logger.log(`WhatsApp connected for tenant ${tenantId}`);

    return {
      connected: true,
      verified: isValid,
      message: isValid
        ? 'WhatsApp Business API connected and verified successfully!'
        : 'Credentials saved. Could not verify with Meta API — please double-check your access token.',
    };
  }

  /**
   * Verify Meta API credentials by calling the Graph API.
   */
  private async verifyMetaCredentials(dto: ConnectWhatsAppDto): Promise<boolean> {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${dto.phoneNumberId}?access_token=${dto.accessToken}`,
      );
      if (response.ok) {
        const data = await response.json() as any;
        this.logger.log(`Meta API verified phone: ${data['display_phone_number'] || 'unknown'}`);
        return true;
      }
      this.logger.warn(`Meta API verification failed: ${response.status}`);
      return false;
    } catch (error) {
      this.logger.warn(`Meta API verification error: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Step 3: Save business profile information.
   */
  async saveBusinessProfile(tenantId: string, dto: BusinessProfileDto) {
    if (!dto.businessName?.trim()) {
      throw new BadRequestException('Business name is required');
    }

    await this.tenantRepository.update(tenantId, {
      businessName: dto.businessName,
      businessCategory: dto.businessCategory,
      businessDescription: dto.businessDescription || null,
      businessAddress: dto.businessAddress || null,
      logoUrl: dto.logoUrl || null,
      name: dto.businessName, // also update the main tenant name
      onboardingStatus: 'profile_complete',
    });

    this.logger.log(`Business profile saved for tenant ${tenantId}`);
    return { saved: true };
  }

  /**
   * Step 4: Mark onboarding as completed.
   */
  async completeOnboarding(tenantId: string) {
    await this.tenantRepository.update(tenantId, {
      onboardingStatus: 'completed',
    });
    this.logger.log(`Onboarding completed for tenant ${tenantId}`);
    return { completed: true };
  }

  /**
   * Skip onboarding (allow user to set up later from settings).
   */
  async skipOnboarding(tenantId: string) {
    await this.tenantRepository.update(tenantId, {
      onboardingStatus: 'completed',
    });
    return { skipped: true };
  }

  /**
   * Returns step-by-step instructions for setting up WhatsApp Business API.
   * Written for non-technical users.
   */
  getSetupGuide() {
    return {
      title: 'How to Set Up WhatsApp Business API',
      estimatedTime: '15-30 minutes',
      prerequisites: [
        'A phone number that is NOT currently registered on WhatsApp or WhatsApp Business app',
        'A Facebook account',
        'A valid business with a website or social media presence',
      ],
      steps: [
        {
          step: 1,
          title: 'Create a Meta Business Account',
          description: 'Go to Meta Business Suite and create a business account if you don\'t have one. This is free and takes about 5 minutes.',
          link: 'https://business.facebook.com/',
          linkLabel: 'Open Meta Business Suite',
          tips: [
            'Use your real business name — Meta verifies this',
            'Add your business website or Facebook page',
            'You\'ll need to verify your email address',
          ],
        },
        {
          step: 2,
          title: 'Set Up a Meta Developer Account',
          description: 'Go to Meta for Developers and create a developer account using the same Facebook account you used above.',
          link: 'https://developers.facebook.com/',
          linkLabel: 'Open Meta for Developers',
          tips: [
            'Click "Get Started" and follow the steps',
            'Accept the developer terms and conditions',
            'This is free — no payment required',
          ],
        },
        {
          step: 3,
          title: 'Create a Meta App for WhatsApp',
          description: 'In the developer dashboard, create a new App. Select "Business" as the app type, then add WhatsApp as a product.',
          link: 'https://developers.facebook.com/apps/create/',
          linkLabel: 'Create New App',
          tips: [
            'Choose "Business" as the app type',
            'Give it a name like "My Store WhatsApp"',
            'Select your Business Account from the dropdown',
            'After creation, click "Set up" next to WhatsApp in the products section',
          ],
        },
        {
          step: 4,
          title: 'Add Your Phone Number',
          description: 'In the WhatsApp section of your app, go to "API Setup". Here you can add your business phone number. The number must NOT be currently registered on WhatsApp or WhatsApp Business app.',
          link: 'https://developers.facebook.com/apps/',
          linkLabel: 'Go to My Apps',
          important: true,
          tips: [
            'IMPORTANT: Remove the phone number from WhatsApp/WhatsApp Business app FIRST',
            'Go to WhatsApp app → Settings → Account → Delete Account',
            'Wait 5 minutes after deleting before adding here',
            'You\'ll receive a verification code via SMS to confirm the number',
          ],
        },
        {
          step: 5,
          title: 'Get Your API Credentials',
          description: 'After adding your phone number, you\'ll see three pieces of information you need to copy and paste back here:',
          details: [
            {
              label: 'Phone Number ID',
              where: 'Found on the API Setup page, under your phone number',
              example: 'Looks like: 1234567890123456',
            },
            {
              label: 'WhatsApp Business Account ID (WABA ID)',
              where: 'Found on the API Setup page or in WhatsApp > Account Settings',
              example: 'Looks like: 9876543210123456',
            },
            {
              label: 'Permanent Access Token',
              where: 'Go to Business Settings > System Users > Generate Token with whatsapp_business_messaging permission',
              example: 'A long string starting with "EAA..."',
            },
          ],
          link: 'https://business.facebook.com/settings/system-users',
          linkLabel: 'Go to System Users',
          tips: [
            'Create a System User with "Admin" role',
            'Generate a token with "whatsapp_business_messaging" and "whatsapp_business_management" permissions',
            'Copy the token immediately — it won\'t be shown again!',
            'This permanent token doesn\'t expire (unlike the temporary test token)',
          ],
        },
        {
          step: 6,
          title: 'Configure the Webhook',
          description: 'In the WhatsApp section, go to "Configuration" to set up the webhook. This lets your store receive messages from customers.',
          tips: [
            'Callback URL: Your platform will provide this automatically after connecting',
            'Verify Token: We\'ll generate this for you',
            'Subscribe to: messages, message_templates',
          ],
        },
      ],
      troubleshooting: [
        {
          problem: 'Phone number is already registered on WhatsApp',
          solution: 'Open WhatsApp on your phone → Settings → Account → Delete Account. Wait 5 minutes, then try again.',
        },
        {
          problem: 'Verification code not received',
          solution: 'Make sure the phone can receive SMS. Try the "Call me" option instead. Check that the country code is correct.',
        },
        {
          problem: 'Business verification pending',
          solution: 'Meta may ask for business documents (registration certificate, utility bill). Upload them in Business Settings → Business Verification. This can take 1-3 business days.',
        },
        {
          problem: 'Access token expired or invalid',
          solution: 'Make sure you\'re using a permanent token from System Users, not the temporary token from API Setup. Regenerate if needed.',
        },
        {
          problem: 'Messages not being received',
          solution: 'Check that the webhook is configured correctly. Make sure you\'ve subscribed to "messages" field. Verify your app is in "Live" mode (not development).',
        },
      ],
      support: {
        metaDocs: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
        metaSupport: 'https://business.facebook.com/direct-support',
        communityForum: 'https://developers.facebook.com/community/',
      },
    };
  }
}
