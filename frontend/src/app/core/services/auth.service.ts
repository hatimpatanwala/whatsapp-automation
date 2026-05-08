import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { ApiService } from './api.service';
import { User, SuperAdminUser } from '../models';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  type: 'admin' | 'tenant_user';
  admin?: SuperAdminUser;
  user?: User;
  tenantId?: string;
}

export interface SignupPayload {
  name: string;
  email: string;
  phone?: string;
  password: string;
  businessName?: string;
}

export interface SignupResponse {
  type?: 'tenant_user';
  user?: User;
  tenantId?: string;
  tenant?: { id: string; name: string };
  error?: boolean;
  message?: string;
}

export interface TenantSubscription {
  plan: string;
  status: string;
  maxProducts: number;
  maxConversations: number;
  maxCampaignsPerMonth: number;
  conversationsUsed: number;
  validFrom: string | null;
  validUntil: string | null;
  allowExceed: boolean;
}

export interface TenantInfo {
  id: string;
  slug?: string;
  onboardingStatus: string;
  whatsappPhone?: string;
  businessName?: string;
  businessCategory?: string;
  businessDescription?: string;
  businessAddress?: string;
  logoUrl?: string;
  hasWhatsAppConfig: boolean;
}

export interface MeResponse {
  type: 'admin' | 'tenant_user' | null;
  admin?: SuperAdminUser;
  user?: User;
  tenant?: TenantInfo;
  subscription?: TenantSubscription;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly currentUser = signal<User | null>(null);
  readonly currentAdmin = signal<SuperAdminUser | null>(null);
  readonly tenantInfo = signal<TenantInfo | null>(null);
  readonly subscriptionInfo = signal<TenantSubscription | null>(null);

  readonly isAuthenticated = computed(() => this.currentUser() !== null || this.currentAdmin() !== null);
  readonly isSuperAdmin = computed(() => this.currentAdmin() !== null);
  readonly userDisplayName = computed(() => {
    const admin = this.currentAdmin();
    if (admin) return admin.name;
    const user = this.currentUser();
    return user?.name ?? 'User';
  });
  readonly userRole = computed(() => {
    const admin = this.currentAdmin();
    if (admin) return admin.role;
    return this.currentUser()?.role ?? 'staff';
  });

  /**
   * Unified login: email + password. Backend determines role.
   */
  login(credentials: LoginCredentials): Observable<LoginResponse> {
    return this.api.http.post<LoginResponse>(this.api.url('/auth/login'), credentials, {
      withCredentials: true,
    }).pipe(
      tap((res) => {
        if (res.type === 'admin') {
          this.currentAdmin.set(res.admin!);
          this.currentUser.set(null);
        } else {
          this.currentUser.set(res.user!);
          this.currentAdmin.set(null);
        }
      }),
    );
  }

  signup(payload: SignupPayload): Observable<SignupResponse> {
    return this.api.http.post<SignupResponse>(this.api.url('/auth/signup'), payload, {
      withCredentials: true,
    }).pipe(
      tap((res) => {
        if (!res.error && res.user) {
          this.currentUser.set(res.user);
          this.currentAdmin.set(null);
        }
      }),
    );
  }

  logout(): Observable<void> {
    return this.api.post<void>('/auth/logout', {}).pipe(
      tap(() => this.clearState()),
      catchError((err) => {
        this.clearState();
        return throwError(() => err);
      }),
    );
  }

  /**
   * Unified session rehydration from /auth/me
   */
  rehydrateSession(): Observable<MeResponse> {
    return this.api.http.get<MeResponse>(this.api.url('/auth/me'), {
      withCredentials: true,
    }).pipe(
      tap((res) => {
        if (res.type === 'admin') {
          this.currentAdmin.set(res.admin!);
          this.currentUser.set(null);
        } else if (res.type === 'tenant_user') {
          this.currentUser.set(res.user!);
          this.tenantInfo.set(res.tenant ?? null);
          this.subscriptionInfo.set(res.subscription ?? null);
          this.currentAdmin.set(null);
        }
      }),
      catchError((err) => {
        this.currentUser.set(null);
        this.currentAdmin.set(null);
        return throwError(() => err);
      }),
    );
  }

  private clearState(): void {
    this.currentUser.set(null);
    this.currentAdmin.set(null);
    this.tenantInfo.set(null);
    this.subscriptionInfo.set(null);
    this.router.navigate(['/auth/login']);
  }
}
