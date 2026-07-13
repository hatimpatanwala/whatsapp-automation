import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { PermissionService } from '../../core/services/permission.service';

type Level = 'none' | 'read' | 'write';
interface Feature { key: string; label: string; group: string; }

/**
 * Team & Roles (RBAC admin). Create employees, assign roles, and define what
 * each role can see/do per feature (none / read / write) — enforced across the
 * portal and the ERP. Only users with employees:write (the owner always) reach
 * the write actions.
 */
@Component({
  selector: 'wa-team',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  template: `
    <div class="p-4 md:p-6 max-w-6xl mx-auto select-none">
      <div class="flex items-center gap-4 mb-4 border-b pb-3 flex-wrap">
        <h1 class="text-xl font-bold text-gray-900">Team &amp; Roles</h1>
        <div class="flex rounded-lg overflow-hidden border text-sm">
          @for (t of ['employees','roles']; track t) {
            <button (click)="tab.set(t)" class="px-4 py-1.5 capitalize font-medium"
              [class.bg-slate-800]="tab() === t" [class.text-white]="tab() === t">{{ t }}</button>
          }
        </div>
        @if (!canManage()) { <span class="text-xs text-amber-600">Read-only — you can view but not change the team.</span> }
        @if (msg()) { <span class="text-sm px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">✓ {{ msg() }}</span> }
        @if (err()) { <span class="text-sm text-red-600">{{ err() }}</span> }
      </div>

      <!-- ══════════ EMPLOYEES ══════════ -->
      @if (tab() === 'employees') {
        @if (canManage()) {
          <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5 flex flex-wrap items-end gap-3">
            <label class="text-xs text-slate-500">Name<br/><input [(ngModel)]="nName" class="border rounded px-2 py-1.5 text-sm w-44" placeholder="Ramesh Kumar" /></label>
            <label class="text-xs text-slate-500">Email<br/><input [(ngModel)]="nEmail" class="border rounded px-2 py-1.5 text-sm w-52" placeholder="name@company.com" /></label>
            <label class="text-xs text-slate-500">Phone<br/><input [(ngModel)]="nPhone" class="border rounded px-2 py-1.5 text-sm w-36" placeholder="9198…" /></label>
            <label class="text-xs text-slate-500">Password<br/><input [(ngModel)]="nPass" type="text" class="border rounded px-2 py-1.5 text-sm w-36" placeholder="min 6 chars" /></label>
            <label class="text-xs text-slate-500">Role<br/>
              <select [(ngModel)]="nRole" class="border rounded px-2 py-1.5 text-sm w-40 bg-white">
                <option value="">— pick a role —</option>
                @for (r of roles(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }
              </select>
            </label>
            <button (click)="addEmployee()" [disabled]="busy()" class="px-3 py-1.5 rounded bg-slate-800 text-white text-sm disabled:opacity-50">+ Add employee</button>
          </div>
        }
        <table class="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
          <thead><tr class="bg-slate-100 text-slate-600 text-left">
            <th class="px-3 py-2">Name</th><th class="px-3 py-2">Login</th><th class="px-3 py-2 w-44">Role</th>
            <th class="px-3 py-2 w-24">Status</th><th class="px-3 py-2 w-36">Last login</th><th class="px-3 py-2 w-52"></th>
          </tr></thead>
          <tbody>
            @for (e of employees(); track e.id) {
              <tr class="border-t border-slate-100" [class.opacity-50]="!e.isActive">
                <td class="px-3 py-2 font-medium">{{ e.name }} @if (e.role === 'owner') { <span class="text-[10px] bg-amber-100 text-amber-700 rounded px-1">Owner</span> }</td>
                <td class="px-3 py-2 text-slate-500 text-xs">{{ e.email || e.phone }}</td>
                <td class="px-3 py-2">
                  @if (canManage() && e.role !== 'owner') {
                    <select [ngModel]="e.roleId" (ngModelChange)="changeRole(e, $event)" class="border rounded px-2 py-1 text-sm bg-white w-full">
                      <option [ngValue]="null">— none —</option>
                      @for (r of roles(); track r.id) { <option [ngValue]="r.id">{{ r.name }}</option> }
                    </select>
                  } @else { <span class="capitalize">{{ e.roleName || e.role }}</span> }
                </td>
                <td class="px-3 py-2 text-center text-xs"><span [class.text-emerald-700]="e.isActive" [class.text-red-600]="!e.isActive">{{ e.isActive ? 'Active' : 'Off' }}</span></td>
                <td class="px-3 py-2 text-xs text-slate-400">{{ e.lastLoginAt ? (e.lastLoginAt | date:'dd MMM, HH:mm') : '—' }}</td>
                <td class="px-3 py-2 text-right whitespace-nowrap">
                  @if (canManage() && e.role !== 'owner') {
                    <button (click)="resetPw(e)" class="text-xs px-2 py-1 rounded border mr-1">Reset password</button>
                    <button (click)="toggleActive(e)" class="text-xs px-2 py-1 rounded border" [class.text-red-600]="e.isActive">{{ e.isActive ? 'Deactivate' : 'Activate' }}</button>
                  }
                </td>
              </tr>
            } @empty { <tr><td colspan="6" class="px-3 py-6 text-center text-slate-400">No employees yet.</td></tr> }
          </tbody>
        </table>
        <p class="text-xs text-slate-400 mt-2">An employee signs in with their email/phone + password. What they can see and edit — in the portal and the ERP — comes from their role's permissions.</p>
      }

      <!-- ══════════ ROLES ══════════ -->
      @if (tab() === 'roles') {
        <div class="grid md:grid-cols-[260px_1fr] gap-5">
          <div>
            @if (canManage()) {
              <div class="flex gap-2 mb-3">
                <input [(ngModel)]="nRoleName" class="border rounded px-2 py-1.5 text-sm flex-1" placeholder="New role name" />
                <button (click)="addRole()" [disabled]="busy()" class="px-3 py-1.5 rounded bg-slate-800 text-white text-sm">+ Add</button>
              </div>
            }
            @for (r of roles(); track r.id) {
              <button (click)="selectRole(r)" class="w-full text-left px-3 py-2 rounded-lg mb-1.5 border"
                [class.border-indigo-400]="sel()?.id === r.id" [class.bg-indigo-50]="sel()?.id === r.id" [class.border-slate-200]="sel()?.id !== r.id">
                <div class="flex items-center justify-between">
                  <span class="font-medium text-sm">{{ r.name }}</span>
                  @if (r.isSystem) { <span class="text-[10px] bg-slate-200 text-slate-600 rounded px-1">system</span> }
                </div>
                <span class="text-xs text-slate-400">{{ r.userCount || 0 }} user(s)</span>
              </button>
            }
          </div>

          <div>
            @if (sel(); as r) {
              <div class="flex items-center gap-3 mb-3 flex-wrap">
                <h2 class="text-lg font-bold">{{ r.name }}</h2>
                @if (r.name === 'Owner') { <span class="text-xs text-amber-600">Owner always has full access.</span> }
                @if (canManage() && r.name !== 'Owner') {
                  <button (click)="saveRole()" [disabled]="busy()" class="ml-auto px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-50">Save permissions</button>
                  @if (!r.isSystem) { <button (click)="deleteRole(r)" class="px-3 py-1.5 rounded border text-red-600 text-sm">Delete role</button> }
                }
              </div>
              <input [(ngModel)]="selDesc" [disabled]="!canManage() || r.name === 'Owner'" class="border rounded px-2 py-1.5 text-sm w-full mb-4" placeholder="Description" />

              @for (g of featureGroups(); track g) {
                <div class="mb-3">
                  <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">{{ g }}</div>
                  @for (f of featuresIn(g); track f.key) {
                    <div class="flex items-center gap-3 py-1.5 border-b border-slate-50">
                      <span class="text-sm flex-1">{{ f.label }}</span>
                      <div class="flex rounded-lg overflow-hidden border text-xs">
                        @for (lv of levels; track lv) {
                          <button (click)="setLevel(f.key, lv)" [disabled]="!canManage() || r.name === 'Owner'"
                            class="px-3 py-1 capitalize"
                            [class.bg-slate-800]="matrix[f.key] === lv" [class.text-white]="matrix[f.key] === lv"
                            [class.text-slate-400]="matrix[f.key] !== lv">{{ lv }}</button>
                        }
                      </div>
                    </div>
                  }
                </div>
              }
            } @else {
              <div class="text-slate-400 text-sm p-8 text-center border border-dashed border-slate-200 rounded-xl">Pick a role to see and edit its permissions.</div>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class TeamComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly perms = inject(PermissionService);

  readonly tab = signal('employees');
  readonly employees = signal<any[]>([]);
  readonly roles = signal<any[]>([]);
  readonly features = signal<Feature[]>([]);
  readonly sel = signal<any>(null);
  readonly busy = signal(false);
  readonly msg = signal('');
  readonly err = signal('');
  readonly levels: Level[] = ['none', 'read', 'write'];

  readonly canManage = computed(() => this.perms.can('employees', 'write'));
  readonly featureGroups = computed(() => [...new Set(this.features().map((f) => f.group))]);
  featuresIn(group: string): Feature[] { return this.features().filter((f) => f.group === group); }

  matrix: Record<string, Level> = {};
  selDesc = '';
  nName = ''; nEmail = ''; nPhone = ''; nPass = ''; nRole = '';
  nRoleName = '';

  ngOnInit() {
    this.api.get<Feature[]>('/access/features').subscribe((f) => this.features.set(f || []));
    this.loadRoles();
    this.loadEmployees();
  }

  private loadRoles() { this.api.get<any[]>('/access/roles').subscribe({ next: (r) => this.roles.set(r || []), error: () => {} }); }
  private loadEmployees() { this.api.get<any[]>('/access/employees').subscribe({ next: (e) => this.employees.set(e || []), error: () => {} }); }

  // ─── Employees ──────────────────────────────────────────────
  addEmployee() {
    if (!this.nName.trim() || !this.nPass) { this.flashErr('Name and password are required'); return; }
    this.busy.set(true);
    this.api.post('/access/employees', { name: this.nName.trim(), email: this.nEmail.trim() || undefined, phone: this.nPhone.trim() || undefined, password: this.nPass, roleId: this.nRole || undefined })
      .subscribe({
        next: () => { this.busy.set(false); this.nName = this.nEmail = this.nPhone = this.nPass = this.nRole = ''; this.flash('Employee added'); this.loadEmployees(); this.loadRoles(); },
        error: (e) => { this.busy.set(false); this.flashErr(e?.error?.message || 'Could not add'); },
      });
  }
  changeRole(e: any, roleId: string | null) {
    this.api.patch(`/access/employees/${e.id}`, { roleId }).subscribe({
      next: () => { this.flash(`${e.name}'s role updated`); this.loadEmployees(); this.loadRoles(); },
      error: (x) => this.flashErr(x?.error?.message || 'Could not update'),
    });
  }
  toggleActive(e: any) {
    this.api.patch(`/access/employees/${e.id}`, { isActive: !e.isActive }).subscribe({
      next: () => { this.flash(e.isActive ? 'Deactivated' : 'Activated'); this.loadEmployees(); },
      error: (x) => this.flashErr(x?.error?.message || 'Could not update'),
    });
  }
  resetPw(e: any) {
    const pw = prompt(`New password for ${e.name} (min 6 chars):`);
    if (!pw) return;
    this.api.patch(`/access/employees/${e.id}`, { password: pw }).subscribe({
      next: () => this.flash('Password reset'),
      error: (x) => this.flashErr(x?.error?.message || 'Could not reset'),
    });
  }

  // ─── Roles ──────────────────────────────────────────────────
  selectRole(r: any) {
    this.sel.set(r);
    const p = typeof r.permissions === 'string' ? JSON.parse(r.permissions) : (r.permissions || {});
    this.matrix = {};
    for (const f of this.features()) this.matrix[f.key] = (p[f.key] as Level) || 'none';
    this.selDesc = r.description || '';
  }
  setLevel(key: string, lv: Level) { this.matrix = { ...this.matrix, [key]: lv }; }
  addRole() {
    if (!this.nRoleName.trim()) { this.flashErr('Role name required'); return; }
    this.busy.set(true);
    this.api.post('/access/roles', { name: this.nRoleName.trim(), permissions: {} }).subscribe({
      next: (r: any) => { this.busy.set(false); this.nRoleName = ''; this.flash('Role created'); this.loadRoles(); setTimeout(() => this.selectRole(r), 200); },
      error: (e) => { this.busy.set(false); this.flashErr(e?.error?.message || 'Could not create'); },
    });
  }
  saveRole() {
    const r = this.sel(); if (!r) return;
    this.busy.set(true);
    this.api.patch(`/access/roles/${r.id}`, { description: this.selDesc, permissions: this.matrix }).subscribe({
      next: () => { this.busy.set(false); this.flash('Permissions saved'); this.loadRoles(); this.perms.refresh(); },
      error: (e) => { this.busy.set(false); this.flashErr(e?.error?.message || 'Could not save'); },
    });
  }
  deleteRole(r: any) {
    if (!confirm(`Delete role "${r.name}"?`)) return;
    this.api.delete(`/access/roles/${r.id}`).subscribe({
      next: () => { this.flash('Role deleted'); this.sel.set(null); this.loadRoles(); },
      error: (e) => this.flashErr(e?.error?.message || 'Could not delete'),
    });
  }

  private flash(m: string) { this.msg.set(m); this.err.set(''); setTimeout(() => this.msg.set(''), 3000); }
  private flashErr(m: string) { this.err.set(m); this.msg.set(''); setTimeout(() => this.err.set(''), 4500); }
}
