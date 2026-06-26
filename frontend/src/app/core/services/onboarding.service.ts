import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export type OnboardingStep = 'pending' | 'whatsapp_connected' | 'profile_complete' | 'completed';

export interface OnboardingStatus {
  currentStep: OnboardingStep;
  phone: string | null;
  hasWhatsAppConfig: boolean;
  businessName: string | null;
  businessCategory: string | null;
  businessDescription: string | null;
  businessAddress: string | null;
  logoUrl: string | null;
  adminWhatsappNumber: string | null;
  adminWhatsappVerified: boolean;
}

export interface RegisterNumberResult {
  status: 'already_business' | 'already_occupied' | 'registered' | 'needs_verification';
  phone: string;
  message: string;
  phoneId?: string;
  needsVerification?: boolean;
  instructions?: string[];
}

export interface BusinessProfilePayload {
  businessName: string;
  businessCategory: string;
  businessDescription?: string;
  businessAddress?: string;
  logoUrl?: string;
  // Invoicing / GST (optional)
  legalName?: string;
  gstin?: string;
  gstState?: string;
  gstStateCode?: string;
  invoicePrefix?: string;
  invoiceEmail?: string;
  invoiceWebsite?: string;
}

// ─── Session-based onboarding types ──────────────────────────────────────────

export type OnboardingState =
  | 'initiated' | 'detecting' | 'fresh_number'
  | 'regular_wa_detected' | 'business_wa_detected' | 'other_bsp_detected'
  | 'needs_wa_removal' | 'needs_business_removal' | 'needs_bsp_migration'
  | 'waiting_user_action' | 'retry_detecting'
  | 'otp_sent' | 'otp_verified' | 'registering'
  | 'active' | 'failed' | 'expired';

export interface MigrationGuide {
  provider: string;
  title: string;
  estimatedTime: string;
  steps: string[];
  warnings: string[];
  helpUrl?: string;
}

export interface StartOnboardingResult {
  sessionId: string;
  state: OnboardingState;
  phoneNumberId?: string;
  migrationGuide?: MigrationGuide;
  message: string;
}

export interface SessionStatus {
  sessionId: string;
  state: OnboardingState;
  phone: string;
  detectionResult: Record<string, any>;
  migrationInstructions: string[] | null;
  detectedProvider: string | null;
  retryCount: number;
  otpAttempts: number;
  stepLog: Array<{ state: string; timestamp: string; detail?: string }>;
  createdAt: string;
  updatedAt: string;
}

// ─── Personalization types ──────────────────────────────────────────────────

export interface CategorySubcategory {
  value: string;
  label: string;
}

export interface CategoryInfo {
  value: string;
  label: string;
  icon: string;
  subcategories: CategorySubcategory[];
  recommendedFeatures: string[];
}

export interface FeatureInfo {
  key: string;
  label: string;
  description: string;
  icon: string;
  group: string;
  kind?: 'workflow' | 'notification';
}

export interface CategoriesResponse {
  categories: CategoryInfo[];
  features: FeatureInfo[];
}

export interface PersonalizePayload {
  category: string;
  subcategory: string;
  selectedFeatures: string[];
}

export interface PersonalizeResult {
  success: boolean;
  created: { name: string; id: string }[];
  errors: string[];
  message: string;
}

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly api = inject(ApiService);

  getStatus(): Observable<OnboardingStatus> {
    return this.api.get<OnboardingStatus>('/onboarding/status');
  }

  /**
   * Which ways the tenant may connect a number (Embedded Signup is always on;
   * direct registration is a super-admin toggle).
   */
  getRegistrationOptions(): Observable<{ embeddedSignup: boolean; directRegistration: boolean }> {
    return this.api.get<{ embeddedSignup: boolean; directRegistration: boolean }>('/onboarding/registration-options');
  }

  /**
   * Register a phone number under the platform's shared WABA.
   * Checks availability, registers on Meta, assigns to tenant.
   */
  registerNumber(phone: string): Observable<RegisterNumberResult> {
    return this.api.post<RegisterNumberResult>('/onboarding/register-number', { phone });
  }

  /**
   * Request a verification code via SMS or voice call.
   */
  requestVerificationCode(phoneId: string, method: 'sms' | 'voice' = 'sms'): Observable<{ sent: boolean; method: string; message: string }> {
    return this.api.post('/onboarding/request-code', { phoneId, method });
  }

  /**
   * Verify the phone number with the code received.
   */
  verifyNumber(phoneId: string, code: string): Observable<{ verified: boolean; message: string }> {
    return this.api.post('/onboarding/verify-code', { phoneId, code });
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

  // ─── Session-based onboarding engine ──────────────────────────────────────

  /**
   * Start a new onboarding session with phone detection.
   */
  startSession(phone: string): Observable<StartOnboardingResult> {
    return this.api.post<StartOnboardingResult>('/onboarding/start', { phone });
  }

  /**
   * Get session status by ID.
   */
  getSessionStatus(sessionId: string): Observable<SessionStatus> {
    return this.api.get<SessionStatus>(`/onboarding/session/${sessionId}`);
  }

  /**
   * Get the latest onboarding session for the current tenant.
   */
  getActiveSession(): Observable<SessionStatus | null> {
    return this.api.get<SessionStatus | null>('/onboarding/session');
  }

  /**
   * Retry detection after user completes migration steps.
   */
  retrySession(sessionId: string): Observable<StartOnboardingResult> {
    return this.api.post<StartOnboardingResult>(`/onboarding/session/${sessionId}/retry`, {});
  }

  /**
   * Request OTP for a session.
   */
  sessionRequestOtp(sessionId: string, method: 'sms' | 'voice' = 'sms'): Observable<{ sent: boolean; method: string; message: string }> {
    return this.api.post(`/onboarding/session/${sessionId}/request-otp`, { method });
  }

  /**
   * Verify OTP for a session.
   */
  sessionVerifyOtp(sessionId: string, code: string): Observable<{ verified: boolean; sessionId: string; state: OnboardingState; message: string }> {
    return this.api.post(`/onboarding/session/${sessionId}/verify-otp`, { code });
  }

  // ─── Admin WhatsApp (personal number for admin control) ───────────────────

  /**
   * Send OTP to admin's personal WhatsApp number.
   */
  sendAdminWhatsappOtp(phone: string): Observable<{ sent: boolean; message: string }> {
    return this.api.post('/onboarding/admin-whatsapp/send-otp', { phone });
  }

  /**
   * Verify OTP for admin's personal WhatsApp number.
   */
  verifyAdminWhatsappOtp(phone: string, code: string): Observable<{ verified: boolean; message: string }> {
    return this.api.post('/onboarding/admin-whatsapp/verify-otp', { phone, code });
  }

  /**
   * Save admin WhatsApp number directly (no OTP verification).
   */
  saveAdminWhatsapp(phone: string): Observable<{ saved: boolean; phone: string; message: string }> {
    return this.api.post('/onboarding/admin-whatsapp/save', { phone });
  }

  /**
   * Remove admin WhatsApp number.
   */
  removeAdminWhatsapp(): Observable<{ removed: boolean; message: string }> {
    return this.api.delete('/onboarding/admin-whatsapp');
  }

  // ─── Personalization (category + features + auto-workflows) ─────────────────

  /**
   * Get business categories, subcategories, and available features.
   */
  getCategories(): Observable<CategoriesResponse> {
    return this.api.get<CategoriesResponse>('/onboarding/categories');
  }

  /**
   * Submit personalization: category, subcategory, and selected features.
   * Auto-creates and activates workflows based on selections.
   */
  personalize(payload: PersonalizePayload): Observable<PersonalizeResult> {
    return this.api.post<PersonalizeResult>('/onboarding/personalize', payload);
  }
}
