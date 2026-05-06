import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export type OnboardingStep = 'pending' | 'phone_verified' | 'whatsapp_connected' | 'profile_complete' | 'completed';

export interface OnboardingStatus {
  currentStep: OnboardingStep;
  phone: string | null;
  hasWhatsAppConfig: boolean;
  businessName: string | null;
  businessCategory: string | null;
  businessDescription: string | null;
  businessAddress: string | null;
  logoUrl: string | null;
}

export interface PhoneCheckResult {
  phone: string;
  hasWhatsApp: boolean;
  hasWhatsAppBusiness: boolean;
  canAutoSetup: boolean;
  message: string;
}

export interface ConnectWhatsAppPayload {
  phone: string;
  phoneNumberId: string;
  wabaId: string;
  accessToken: string;
  webhookSecret?: string;
}

export interface BusinessProfilePayload {
  businessName: string;
  businessCategory: string;
  businessDescription?: string;
  businessAddress?: string;
  logoUrl?: string;
}

export interface SetupGuide {
  title: string;
  estimatedTime: string;
  prerequisites: string[];
  steps: SetupGuideStep[];
  troubleshooting: { problem: string; solution: string }[];
  support: Record<string, string>;
}

export interface SetupGuideStep {
  step: number;
  title: string;
  description: string;
  link?: string;
  linkLabel?: string;
  important?: boolean;
  tips?: string[];
  details?: { label: string; where: string; example: string }[];
}

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly api = inject(ApiService);

  getStatus(): Observable<OnboardingStatus> {
    return this.api.get<OnboardingStatus>('/onboarding/status');
  }

  checkPhone(phone: string): Observable<PhoneCheckResult> {
    return this.api.post<PhoneCheckResult>('/onboarding/check-phone', { phone });
  }

  connectWhatsApp(payload: ConnectWhatsAppPayload): Observable<{ connected: boolean; verified: boolean; message: string }> {
    return this.api.post('/onboarding/connect-whatsapp', payload);
  }

  saveBusinessProfile(payload: BusinessProfilePayload): Observable<{ saved: boolean }> {
    return this.api.post('/onboarding/business-profile', payload);
  }

  completeOnboarding(): Observable<{ completed: boolean }> {
    return this.api.post('/onboarding/complete', {});
  }

  skipOnboarding(): Observable<{ skipped: boolean }> {
    return this.api.post('/onboarding/skip', {});
  }

  getSetupGuide(): Observable<SetupGuide> {
    return this.api.get<SetupGuide>('/onboarding/setup-guide');
  }
}
