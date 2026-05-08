import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface EmbeddedSignupConfig {
  appId: string;
  configId: string;
  version: string;
  loginParams: {
    scope: string;
    extras: {
      feature: string;
      sessionInfoVersion: number;
    };
  };
}

export interface EmbeddedSignupResult {
  success: boolean;
  message: string;
  phoneNumber?: string;
  wabaId?: string;
  sessionId?: string;
  isCoexistence?: boolean;
  coexistenceSessionId?: string;
}

export interface EmbeddedSignupSession {
  id: string;
  tenantId: string;
  state: string;
  wabaId?: string;
  phoneNumberId?: string;
  isCoexistence: boolean;
  detectedPlatform?: string;
  stepLog: Array<{ state: string; timestamp: string; detail?: string }>;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CoexistenceSession {
  id: string;
  tenantId: string;
  phoneNumber: string;
  state: string;
  existingAppType?: string;
  userConsented: boolean;
  cloudApiMessageTypes: string[];
  stepLog: Array<{ state: string; timestamp: string; detail?: string }>;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class EmbeddedSignupService {
  private readonly api = inject(ApiService);

  /**
   * Get Facebook SDK config for the embedded signup button.
   */
  getConfig(): Observable<EmbeddedSignupConfig> {
    return this.api.get<EmbeddedSignupConfig>('/onboarding/embedded-signup/config');
  }

  /**
   * Process the signup callback after Facebook Login completes.
   */
  processCallback(data: {
    code: string;
    phoneNumberId?: string;
    wabaId?: string;
    sessionInfo?: Record<string, any>;
  }): Observable<EmbeddedSignupResult> {
    return this.api.post<EmbeddedSignupResult>('/onboarding/embedded-signup/callback', {
      ...data,
      redirectUri: window.location.origin + '/',
    });
  }

  /**
   * Get signup session status.
   */
  getSessionStatus(sessionId: string): Observable<EmbeddedSignupSession> {
    return this.api.get<EmbeddedSignupSession>(`/onboarding/embedded-signup/session/${sessionId}`);
  }

  /**
   * Get latest signup session.
   */
  getLatestSession(): Observable<EmbeddedSignupSession | null> {
    return this.api.get<EmbeddedSignupSession | null>('/onboarding/embedded-signup/session');
  }

  // ─── Coexistence ──────────────────────────────────────────────────

  /**
   * Get active coexistence session.
   */
  getCoexistenceSession(): Observable<CoexistenceSession | null> {
    return this.api.get<CoexistenceSession | null>('/onboarding/embedded-signup/coexistence');
  }

  /**
   * Get coexistence session status.
   */
  getCoexistenceStatus(sessionId: string): Observable<CoexistenceSession> {
    return this.api.get<CoexistenceSession>(`/onboarding/embedded-signup/coexistence/${sessionId}`);
  }

  /**
   * Record consent for coexistence mode.
   */
  consentCoexistence(sessionId: string): Observable<CoexistenceSession> {
    return this.api.post<CoexistenceSession>(`/onboarding/embedded-signup/coexistence/${sessionId}/consent`, {});
  }

  /**
   * Start full migration from coexistence to Cloud API.
   */
  migrateFromCoexistence(sessionId: string): Observable<CoexistenceSession> {
    return this.api.post<CoexistenceSession>(`/onboarding/embedded-signup/coexistence/${sessionId}/migrate`, {});
  }
}
