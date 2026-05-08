import { Injectable } from '@nestjs/common';

export interface MigrationGuide {
  provider: string;
  title: string;
  estimatedTime: string;
  steps: string[];
  warnings: string[];
  helpUrl?: string;
}

/**
 * Provides provider-specific migration instructions for users
 * whose phone number is currently registered on another BSP or WhatsApp app.
 */
@Injectable()
export class MigrationGuideService {
  /**
   * Get migration instructions based on detected state.
   */
  getGuide(state: 'business_wa' | 'regular_wa' | 'other_bsp', detectedProvider?: string): MigrationGuide {
    switch (state) {
      case 'regular_wa':
        return this.getRegularWaGuide();
      case 'business_wa':
        return this.getBusinessWaGuide();
      case 'other_bsp':
        return this.getBspGuide(detectedProvider);
    }
  }

  private getRegularWaGuide(): MigrationGuide {
    return {
      provider: 'WhatsApp',
      title: 'Remove Regular WhatsApp',
      estimatedTime: '5-10 minutes',
      steps: [
        'Open WhatsApp on your phone',
        'Go to Settings → Account → Delete my account',
        'Enter your phone number and confirm deletion',
        'Wait 5 minutes for Meta to release the number',
        'Come back here and click "Retry" to continue onboarding',
      ],
      warnings: [
        'You will lose all WhatsApp chat history on this number',
        'You will be removed from all WhatsApp groups',
        'This action cannot be undone',
      ],
    };
  }

  private getBusinessWaGuide(): MigrationGuide {
    return {
      provider: 'WhatsApp Business App',
      title: 'Remove WhatsApp Business App',
      estimatedTime: '5-10 minutes',
      steps: [
        'Open WhatsApp Business app on your phone',
        'Go to Settings → Account → Delete my account',
        'Enter your phone number and confirm deletion',
        'Uninstall the WhatsApp Business app',
        'Wait 5 minutes for Meta to release the number',
        'Come back here and click "Retry" to continue onboarding',
      ],
      warnings: [
        'You will lose all WhatsApp Business chat history',
        'Your WhatsApp Business catalog will be deleted',
        'Your business profile on WhatsApp will be removed',
        'After migration, your business will use our platform instead of the app',
      ],
    };
  }

  private getBspGuide(provider?: string): MigrationGuide {
    const providerGuides: Record<string, Partial<MigrationGuide>> = {
      wati: {
        title: 'Migrate from WATI',
        steps: [
          'Log in to your WATI dashboard at app.wati.io',
          'Go to Settings → Phone Numbers',
          'Click "Delete" on the number you want to migrate',
          'Confirm deletion and wait for confirmation email from WATI',
          'Wait 10-15 minutes for Meta to release the number',
          'Come back here and click "Retry" to continue onboarding',
        ],
        helpUrl: 'https://docs.wati.io/docs/how-to-delete-a-phone-number',
      },
      gupshup: {
        title: 'Migrate from Gupshup',
        steps: [
          'Log in to your Gupshup dashboard',
          'Navigate to WhatsApp → Phone Numbers',
          'Select the number and click "Remove"',
          'Contact Gupshup support if the self-service option is unavailable',
          'Wait 15-30 minutes for Meta to release the number',
          'Come back here and click "Retry" to continue onboarding',
        ],
        helpUrl: 'https://docs.gupshup.io/',
      },
      interakt: {
        title: 'Migrate from Interakt',
        steps: [
          'Log in to your Interakt dashboard',
          'Go to Settings → WhatsApp Configuration',
          'Click "Disconnect Number"',
          'Contact Interakt support at support@interakt.shop if needed',
          'Wait 15-30 minutes for Meta to release the number',
          'Come back here and click "Retry" to continue onboarding',
        ],
      },
      twilio: {
        title: 'Migrate from Twilio',
        steps: [
          'Log in to the Twilio Console at console.twilio.com',
          'Navigate to Messaging → Senders → WhatsApp senders',
          'Select the number and click "Remove"',
          'Wait for Twilio confirmation (usually 1-2 business days)',
          'Come back here and click "Retry" to continue onboarding',
        ],
        helpUrl: 'https://www.twilio.com/docs/whatsapp',
      },
    };

    const specific = provider ? providerGuides[provider] : undefined;

    return {
      provider: provider || 'Unknown BSP',
      title: specific?.title || 'Migrate from Another Provider',
      estimatedTime: '15-60 minutes',
      steps: specific?.steps || [
        'Log in to your current WhatsApp Business API provider\'s dashboard',
        'Find the phone number management section',
        'Remove or disconnect the phone number you want to migrate',
        'Contact your current provider\'s support if you cannot find the option',
        'Wait 15-30 minutes for Meta to release the number',
        'Come back here and click "Retry" to continue onboarding',
      ],
      warnings: [
        'Your message history on the previous platform will not be migrated',
        'Active conversations may be interrupted during migration',
        'Template messages approved on the previous platform will need to be re-submitted',
        'Plan the migration during low-traffic hours to minimize disruption',
      ],
      helpUrl: specific?.helpUrl,
    };
  }
}
