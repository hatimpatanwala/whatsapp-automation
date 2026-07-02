import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface StaffMember {
  id: string;
  name: string;
  email: string | null;
  role: string;
  phone: string | null;
  whatsappNumber: string | null;
  whatsappVerified: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface AddStaffResult {
  member: StaffMember;
  otpSent: boolean;
  staticCode?: string; // only returned on staging (STATIC_OTP_CODE mode)
}

/** Team / staff management — owner-only endpoints under /api/team. */
@Injectable({ providedIn: 'root' })
export class TeamService {
  private readonly api = inject(ApiService);

  list(): Observable<StaffMember[]> {
    return this.api.get<StaffMember[]>('/team');
  }

  /** Effective team entitlement + usage — allowed roles, member cap, members used. */
  config(): Observable<{ allowedRoles: string[]; memberLimit: number | null; used: number; source: string }> {
    return this.api.get<{ allowedRoles: string[]; memberLimit: number | null; used: number; source: string }>('/team/config');
  }

  add(body: { name: string; role: string; whatsappNumber: string; email?: string }): Observable<AddStaffResult> {
    return this.api.post<AddStaffResult>('/team', body);
  }

  resendOtp(id: string): Observable<{ sent: boolean; staticCode?: string }> {
    return this.api.post<{ sent: boolean; staticCode?: string }>(`/team/${id}/send-otp`, {});
  }

  updateRole(id: string, role: string): Observable<StaffMember> {
    return this.api.patch<StaffMember>(`/team/${id}/role`, { role });
  }

  setActive(id: string, active: boolean): Observable<StaffMember> {
    return this.api.patch<StaffMember>(`/team/${id}/active`, { active });
  }
}
