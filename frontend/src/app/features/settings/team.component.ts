import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { TeamService, StaffMember } from '../../core/services/team.service';

const ROLES = [
  { value: 'employee', label: 'Employee', hint: 'Sees only orders assigned to them; updates status.' },
  { value: 'salesman', label: 'Salesman', hint: 'Takes orders from customers over WhatsApp.' },
  { value: 'accountant', label: 'Accountant', hint: 'Sees only accounting (receivables, sales).' },
];

/**
 * Owner-only team management. Add staff with a WhatsApp number, pick their role,
 * and verify their number over WhatsApp so the bot recognises them with a
 * role-scoped menu. Rendered inside Settings → Team.
 */
@Component({
  selector: 'wa-team',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, ToastModule, TooltipModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="max-w-3xl">
      <div class="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 class="text-lg font-semibold text-gray-900">Team</h3>
          <p class="text-sm text-gray-500">Staff operate your store over WhatsApp based on their role. After adding, they verify their number with a code sent on WhatsApp.</p>
          @if (cfg(); as c) {
            <p class="text-xs text-gray-400 mt-1">
              {{ c.used }}@if (c.memberLimit !== null) { / {{ c.memberLimit }}} member(s)@if (c.memberLimit === null) { · unlimited}@if (allowedRoles().length) { · roles: {{ allowedRolesLabel() }}}
            </p>
          }
        </div>
        @if (!showForm() && canAdd()) {
          <button pButton icon="pi pi-plus" label="Add member" class="p-button-sm shrink-0" (click)="showForm.set(true)"></button>
        }
      </div>

      @if (atLimit()) {
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-800">
          <i class="pi pi-lock mr-1"></i> You’ve reached your plan’s team limit ({{ cfg()!.memberLimit }}). Upgrade your plan to add more members.
        </div>
      }
      @if (allowedRoles().length === 0 && !loading()) {
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-800">
          <i class="pi pi-lock mr-1"></i> Your plan doesn’t include team roles. Upgrade to add staff.
        </div>
      }

      <!-- Add form -->
      @if (showForm()) {
        <div class="bg-gray-50 border border-gray-200 rounded-2xl p-4 mb-5">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">Name</label>
              <input [(ngModel)]="form.name" type="text" placeholder="e.g. Priya Sharma"
                class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">Role</label>
              <select [(ngModel)]="form.role" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-200">
                @for (r of availableRoles(); track r.value) { <option [value]="r.value">{{ r.label }}</option> }
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">WhatsApp number</label>
              <input [(ngModel)]="form.whatsappNumber" type="tel" placeholder="e.g. +919876543210"
                class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">Email <span class="text-gray-300">(optional)</span></label>
              <input [(ngModel)]="form.email" type="email" placeholder="name@business.com"
                class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200" />
            </div>
          </div>
          <p class="text-xs text-gray-400 mt-2">{{ roleHint(form.role) }}</p>
          <div class="flex gap-2 mt-4">
            <button pButton label="Add & send code" icon="pi pi-check" class="p-button-sm" [disabled]="saving()" (click)="add()"></button>
            <button pButton label="Cancel" class="p-button-sm p-button-text" [disabled]="saving()" (click)="cancelForm()"></button>
          </div>
        </div>
      }

      <!-- Verification hint after add / resend -->
      @if (pendingCode(); as pc) {
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-3.5 mb-4 text-sm text-amber-800">
          <i class="pi pi-info-circle mr-1"></i>
          Ask <b>{{ pc.name }}</b> to reply to your WhatsApp business number with the code:
          <span class="font-mono font-bold tracking-widest ml-1">{{ pc.code }}</span>
          <span class="block text-xs text-amber-600 mt-1">(Test mode shows the code here; normally it arrives on their WhatsApp.)</span>
        </div>
      }

      <!-- Roster -->
      @if (loading()) {
        <p class="text-sm text-gray-400 py-8 text-center"><i class="pi pi-spin pi-spinner mr-2"></i>Loading team…</p>
      } @else if (!members().length) {
        <p class="text-sm text-gray-400 py-8 text-center">No team members yet. Add your first one above.</p>
      } @else {
        <div class="space-y-2.5">
          @for (m of members(); track m.id) {
            <div class="bg-white border border-gray-100 rounded-2xl p-4 flex flex-wrap items-center gap-3"
              [class.opacity-60]="!m.isActive">
              <div class="w-10 h-10 rounded-full bg-primary-100 text-primary-700 font-bold text-sm flex items-center justify-center shrink-0">
                {{ initials(m.name) }}
              </div>
              <div class="min-w-0 flex-1">
                <p class="font-medium text-gray-900 truncate">{{ m.name }}</p>
                <p class="text-xs text-gray-500">{{ m.whatsappNumber }}
                  @if (m.whatsappVerified) {
                    <span class="ml-1 text-green-600"><i class="pi pi-check-circle"></i> Verified</span>
                  } @else {
                    <span class="ml-1 text-amber-600"><i class="pi pi-clock"></i> Unverified</span>
                  }
                </p>
              </div>
              <select [ngModel]="m.role" (ngModelChange)="changeRole(m, $event)"
                class="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white">
                @for (r of roles; track r.value) { <option [value]="r.value">{{ r.label }}</option> }
              </select>
              @if (!m.whatsappVerified) {
                <button pButton label="Resend code" icon="pi pi-send" class="p-button-sm p-button-outlined" [disabled]="busyId() === m.id" (click)="resend(m)"></button>
              }
              @if (m.isActive) {
                <button pButton icon="pi pi-user-minus" class="p-button-sm p-button-text p-button-danger" pTooltip="Deactivate" [disabled]="busyId() === m.id" (click)="setActive(m, false)"></button>
              } @else {
                <button pButton icon="pi pi-user-plus" class="p-button-sm p-button-text" pTooltip="Reactivate" [disabled]="busyId() === m.id" (click)="setActive(m, true)"></button>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class TeamComponent implements OnInit {
  private readonly team = inject(TeamService);
  private readonly toast = inject(MessageService);

  readonly roles = ROLES;
  members = signal<StaffMember[]>([]);
  loading = signal(true);
  saving = signal(false);
  busyId = signal<string | null>(null);
  showForm = signal(false);
  pendingCode = signal<{ name: string; code: string } | null>(null);
  cfg = signal<{ allowedRoles: string[]; memberLimit: number | null; used: number; source: string } | null>(null);

  /** Roles this tenant may assign (plan/super-admin gated); all if config not loaded. */
  allowedRoles = computed(() => this.cfg()?.allowedRoles ?? ROLES.map((r) => r.value));
  availableRoles = computed(() => ROLES.filter((r) => this.allowedRoles().includes(r.value)));
  allowedRolesLabel = computed(() => this.availableRoles().map((r) => r.label).join(', '));
  atLimit = computed(() => {
    const c = this.cfg();
    return !!c && c.memberLimit !== null && c.used >= c.memberLimit;
  });
  canAdd = computed(() => this.allowedRoles().length > 0 && !this.atLimit());

  form = { name: '', role: 'employee', whatsappNumber: '', email: '' };

  ngOnInit(): void {
    this.load();
    this.loadConfig();
  }

  private loadConfig(): void {
    this.team.config().subscribe({
      next: (c) => {
        this.cfg.set(c);
        // Default the add-form role to the first allowed role.
        if (c.allowedRoles.length && !c.allowedRoles.includes(this.form.role)) this.form.role = c.allowedRoles[0];
      },
      error: () => this.cfg.set(null),
    });
  }

  private load(): void {
    this.loading.set(true);
    this.team.list().subscribe({
      next: (list) => { this.members.set(list || []); this.loading.set(false); },
      error: () => { this.members.set([]); this.loading.set(false); },
    });
  }

  roleHint(role: string): string {
    return ROLES.find((r) => r.value === role)?.hint || '';
  }
  initials(name: string): string {
    return (name || '?').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.form = { name: '', role: 'employee', whatsappNumber: '', email: '' };
  }

  add(): void {
    if (this.saving()) return;
    if (!this.form.name.trim() || !this.form.whatsappNumber.trim()) {
      this.toast.add({ severity: 'warn', summary: 'Name and WhatsApp number are required' });
      return;
    }
    this.saving.set(true);
    this.team.add({ ...this.form, email: this.form.email || undefined }).subscribe({
      next: (r) => {
        this.saving.set(false);
        this.cancelForm();
        this.load();
        this.loadConfig();
        if (r.staticCode) this.pendingCode.set({ name: r.member.name, code: r.staticCode });
        this.toast.add({ severity: 'success', summary: 'Team member added', detail: r.otpSent ? 'A verification code was sent on WhatsApp.' : 'Added — send them a code to verify.' });
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.add({ severity: 'error', summary: 'Could not add', detail: e?.error?.message || 'Please try again.' });
      },
    });
  }

  resend(m: StaffMember): void {
    this.busyId.set(m.id);
    this.team.resendOtp(m.id).subscribe({
      next: (r) => {
        this.busyId.set(null);
        if (r.staticCode) this.pendingCode.set({ name: m.name, code: r.staticCode });
        this.toast.add({ severity: 'success', summary: 'Code sent', detail: `A fresh code was sent to ${m.name}.` });
      },
      error: (e) => { this.busyId.set(null); this.toast.add({ severity: 'error', summary: 'Could not send', detail: e?.error?.message || 'Please try again.' }); },
    });
  }

  changeRole(m: StaffMember, role: string): void {
    if (role === m.role) return;
    this.busyId.set(m.id);
    this.team.updateRole(m.id, role).subscribe({
      next: () => { this.busyId.set(null); this.members.update((list) => list.map((x) => (x.id === m.id ? { ...x, role } : x))); this.toast.add({ severity: 'success', summary: 'Role updated' }); },
      error: (e) => { this.busyId.set(null); this.toast.add({ severity: 'error', summary: 'Could not update role', detail: e?.error?.message }); },
    });
  }

  setActive(m: StaffMember, active: boolean): void {
    this.busyId.set(m.id);
    this.team.setActive(m.id, active).subscribe({
      next: () => { this.busyId.set(null); this.members.update((list) => list.map((x) => (x.id === m.id ? { ...x, isActive: active } : x))); this.toast.add({ severity: 'success', summary: active ? 'Reactivated' : 'Deactivated' }); },
      error: (e) => { this.busyId.set(null); this.toast.add({ severity: 'error', summary: 'Could not update', detail: e?.error?.message }); },
    });
  }
}
