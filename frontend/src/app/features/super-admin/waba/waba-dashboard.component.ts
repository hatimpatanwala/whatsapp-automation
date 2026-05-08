import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TabsModule } from 'primeng/tabs';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { ProgressBarModule } from 'primeng/progressbar';
import { TooltipModule } from 'primeng/tooltip';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MessageService } from 'primeng/api';
import {
  WabaService,
  WabaAccount,
  WabaPhoneNumber,
  WabaTemplate,
  QualitySummary,
} from '../../../core/services/waba.service';

@Component({
  selector: 'app-waba-dashboard',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    TableModule, CardModule, ButtonModule, TagModule, TabsModule,
    DialogModule, InputTextModule, SelectModule, ToastModule,
    ProgressBarModule, TooltipModule, ToggleSwitchModule,
  ],
  providers: [MessageService],
  template: `
    <p-toast />

    <div class="mb-6">
      <h1 class="text-2xl font-bold text-surface-900">WABA Management</h1>
      <p class="text-surface-500 mt-1">Manage WhatsApp Business Accounts, phone numbers, and templates</p>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <p-card>
        <div class="text-center">
          <div class="text-3xl font-bold text-primary">{{ accounts().length }}</div>
          <div class="text-surface-500 mt-1">WABA Accounts</div>
        </div>
      </p-card>
      <p-card>
        <div class="text-center">
          <div class="text-3xl font-bold text-blue-500">{{ phones().length }}</div>
          <div class="text-surface-500 mt-1">Phone Numbers</div>
        </div>
      </p-card>
      <p-card>
        <div class="text-center">
          <div class="text-3xl font-bold text-green-500">{{ qualitySummary()?.green || 0 }}</div>
          <div class="text-surface-500 mt-1">Green Quality</div>
        </div>
      </p-card>
      <p-card>
        <div class="text-center">
          <div class="text-3xl font-bold text-orange-500">{{ templates().length }}</div>
          <div class="text-surface-500 mt-1">Templates</div>
        </div>
      </p-card>
    </div>

    <p-tabs value="0">
      <p-tablist>
        <p-tab value="0">WABA Accounts</p-tab>
        <p-tab value="1">Phone Numbers</p-tab>
        <p-tab value="2">Templates</p-tab>
        <p-tab value="3">Quality Monitor</p-tab>
        <p-tab value="4">Audit Logs</p-tab>
      </p-tablist>
      <p-tabpanels>
      <!-- WABA Accounts Tab -->
      <p-tabpanel value="0">
        <div class="flex justify-end mb-4 gap-2">
          <p-button label="Add WABA Account" icon="pi pi-plus" severity="success" (onClick)="showAddWabaDialog = true" />
          <p-button label="Sync from Meta" icon="pi pi-sync" (onClick)="showSyncDialog = true" />
        </div>

        <p-table [value]="accounts()" [loading]="loading()" styleClass="p-datatable-sm" [paginator]="true" [rows]="10">
          <ng-template pTemplate="header">
            <tr>
              <th>Name</th>
              <th>WABA ID</th>
              <th>Currency</th>
              <th>Messaging Tier</th>
              <th>Verification</th>
              <th>Status</th>
              <th>Phones</th>
              <th>Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-account>
            <tr>
              <td class="font-medium">{{ account.name }}</td>
              <td><code class="text-xs">{{ account.wabaId }}</code></td>
              <td>{{ account.currency }}</td>
              <td><p-tag [value]="account.messagingLimitTier" severity="info" /></td>
              <td>
                <p-tag [value]="account.metaBusinessVerification"
                       [severity]="account.metaBusinessVerification === 'verified' ? 'success' : 'warn'" />
              </td>
              <td>
                <p-tag [value]="account.status"
                       [severity]="account.status === 'active' ? 'success' : 'danger'" />
              </td>
              <td>{{ account.phoneNumbers?.length || 0 }}</td>
              <td>
                <div class="flex gap-1">
                  <p-button icon="pi pi-key" size="small" severity="warn" [text]="true"
                            pTooltip="Update Access Token"
                            (onClick)="openTokenDialog(account)" />
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="8" class="text-center py-8 text-surface-400">No WABA accounts configured. Add one or sync from Meta to get started.</td></tr>
          </ng-template>
        </p-table>
      </p-tabpanel>

      <!-- Phone Numbers Tab -->
      <p-tabpanel value="1">
        <div class="flex justify-end mb-4">
          <p-button label="Register Number for Tenant" icon="pi pi-plus" severity="success" (onClick)="showRegisterForTenantDialog = true" />
        </div>

        <p-table [value]="phones()" [loading]="loading()" styleClass="p-datatable-sm" [paginator]="true" [rows]="10">
          <ng-template pTemplate="header">
            <tr>
              <th>Phone Number</th>
              <th>Display Name</th>
              <th>Quality</th>
              <th>Messaging Limit</th>
              <th>Status</th>
              <th>Assigned Tenant</th>
              <th>Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-phone>
            <tr>
              <td class="font-medium">{{ phone.phoneNumber }}</td>
              <td>{{ phone.displayName || phone.verifiedName || '—' }}</td>
              <td>
                <p-tag [value]="phone.qualityRating"
                       [severity]="phone.qualityRating === 'GREEN' ? 'success' : phone.qualityRating === 'YELLOW' ? 'warn' : 'danger'" />
              </td>
              <td>{{ phone.messagingLimit }}</td>
              <td>
                <p-tag [value]="phone.status"
                       [severity]="phone.status === 'active' ? 'success' : 'warn'" />
              </td>
              <td>{{ phone.tenant?.name || '— Unassigned —' }}</td>
              <td>
                <div class="flex gap-2 items-center">
                  <p-toggleswitch
                    [ngModel]="phone.status === 'active'"
                    (onChange)="togglePhoneStatus(phone)"
                    pTooltip="Toggle active/inactive"
                  />
                  @if (!phone.tenantId) {
                    <p-button label="Assign" icon="pi pi-link" size="small" severity="info"
                              (onClick)="openAssignDialog(phone)" />
                  } @else {
                    <p-button label="Unassign" icon="pi pi-times" size="small" severity="warn"
                              (onClick)="unassignPhone(phone)" />
                  }
                  @if (phone.status !== 'active') {
                    <p-button label="Onboard" icon="pi pi-play" size="small"
                              (onClick)="openOnboardDialog(phone)" />
                  }
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="7" class="text-center py-8 text-surface-400">No phone numbers found. Sync a WABA account first.</td></tr>
          </ng-template>
        </p-table>
      </p-tabpanel>

      <!-- Templates Tab -->
      <p-tabpanel value="2">
        <div class="flex justify-end mb-4 gap-2">
          @if (accounts().length > 0) {
            <p-button label="Sync Templates" icon="pi pi-sync" severity="secondary"
                      (onClick)="syncTemplates()" />
          }
        </div>

        <p-table [value]="templates()" [loading]="loading()" styleClass="p-datatable-sm" [paginator]="true" [rows]="15">
          <ng-template pTemplate="header">
            <tr>
              <th>Template Name</th>
              <th>Category</th>
              <th>Language</th>
              <th>Status</th>
              <th>Quality Score</th>
              <th>Tenant</th>
              <th>Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-tmpl>
            <tr>
              <td class="font-medium">{{ tmpl.templateName }}</td>
              <td><p-tag [value]="tmpl.category" severity="info" /></td>
              <td>{{ tmpl.language }}</td>
              <td>
                <p-tag [value]="tmpl.status"
                       [severity]="tmpl.status === 'APPROVED' ? 'success' : tmpl.status === 'REJECTED' ? 'danger' : 'warn'" />
              </td>
              <td>{{ tmpl.qualityScore ?? '—' }}</td>
              <td>{{ tmpl.tenantId ? 'Tenant' : 'Platform' }}</td>
              <td>
                <p-button icon="pi pi-trash" severity="danger" size="small" [text]="true"
                          (onClick)="deleteTemplate(tmpl)" pTooltip="Delete template" />
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="7" class="text-center py-8 text-surface-400">No templates found. Sync from Meta to populate.</td></tr>
          </ng-template>
        </p-table>
      </p-tabpanel>

      <!-- Quality Tab -->
      <p-tabpanel value="3">
        @if (qualitySummary(); as qs) {
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <p-card>
              <div class="text-center">
                <div class="text-3xl font-bold text-green-500">{{ qs.green }}</div>
                <div class="text-surface-500 mt-1">Green</div>
                <p-progressBar [value]="qs.total ? (qs.green / qs.total * 100) : 0" [showValue]="false"
                               styleClass="mt-2" />
              </div>
            </p-card>
            <p-card>
              <div class="text-center">
                <div class="text-3xl font-bold text-yellow-500">{{ qs.yellow }}</div>
                <div class="text-surface-500 mt-1">Yellow</div>
                <p-progressBar [value]="qs.total ? (qs.yellow / qs.total * 100) : 0" [showValue]="false"
                               styleClass="mt-2" />
              </div>
            </p-card>
            <p-card>
              <div class="text-center">
                <div class="text-3xl font-bold text-red-500">{{ qs.red }}</div>
                <div class="text-surface-500 mt-1">Red</div>
                <p-progressBar [value]="qs.total ? (qs.red / qs.total * 100) : 0" [showValue]="false"
                               styleClass="mt-2" />
              </div>
            </p-card>
          </div>
        }
      </p-tabpanel>

      <!-- Audit Logs Tab -->
      <p-tabpanel value="4">
        <p-table [value]="auditLogs()" [loading]="loading()" styleClass="p-datatable-sm" [paginator]="true" [rows]="20">
          <ng-template pTemplate="header">
            <tr>
              <th>Timestamp</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Resource</th>
              <th>Details</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-log>
            <tr>
              <td class="text-xs">{{ log.createdAt | date:'short' }}</td>
              <td><p-tag [value]="log.actorType" severity="info" /></td>
              <td class="font-medium">{{ log.action }}</td>
              <td>{{ log.resourceType }} / <code class="text-xs">{{ log.resourceId }}</code></td>
              <td class="text-xs">{{ log.details | json }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="5" class="text-center py-8 text-surface-400">No audit logs yet.</td></tr>
          </ng-template>
        </p-table>
      </p-tabpanel>
      </p-tabpanels>
    </p-tabs>

    <!-- Sync WABA Dialog -->
    <p-dialog header="Sync WABA from Meta" [(visible)]="showSyncDialog" [modal]="true" [style]="{ width: '30rem' }">
      <div class="flex flex-col gap-4 pt-4">
        <div>
          <label class="block text-sm font-medium mb-1">WABA ID</label>
          <input pInputText [(ngModel)]="syncWabaId" class="w-full" placeholder="e.g. 123456789012345" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Access Token</label>
          <input pInputText [(ngModel)]="syncAccessToken" class="w-full" type="password" placeholder="System User Token" />
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" (onClick)="showSyncDialog = false" />
        <p-button label="Sync" icon="pi pi-sync" (onClick)="syncWaba()" [loading]="syncing()" />
      </ng-template>
    </p-dialog>

    <!-- Add WABA Account Dialog -->
    <p-dialog header="Add WABA Account" [(visible)]="showAddWabaDialog" [modal]="true" [style]="{ width: '35rem' }">
      <div class="flex flex-col gap-4 pt-4">
        <div>
          <label class="block text-sm font-medium mb-1">Account Name</label>
          <input pInputText [(ngModel)]="newWaba.name" class="w-full" placeholder="e.g. Platform WABA" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">WABA ID</label>
          <input pInputText [(ngModel)]="newWaba.wabaId" class="w-full" placeholder="e.g. 1642870743653301" />
          <small class="text-surface-400">Found in Meta Business Settings → WhatsApp Accounts</small>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Business ID</label>
          <input pInputText [(ngModel)]="newWaba.businessId" class="w-full" placeholder="e.g. 935176145735575" />
          <small class="text-surface-400">Found in Meta Business Settings → Business Info</small>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">System User Access Token</label>
          <input pInputText [(ngModel)]="newWaba.accessToken" class="w-full" type="password" placeholder="EAAxxxxxxxx..." />
          <small class="text-surface-400">Generate from Business Settings → System Users → Generate Token</small>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1">Currency</label>
            <p-select [(ngModel)]="newWaba.currency" [options]="currencies" optionLabel="label" optionValue="value" styleClass="w-full" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Timezone</label>
            <p-select [(ngModel)]="newWaba.timezone" [options]="timezones" optionLabel="label" optionValue="value" styleClass="w-full" />
          </div>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" (onClick)="showAddWabaDialog = false" />
        <p-button label="Save & Store Token" icon="pi pi-check" severity="success" (onClick)="saveNewWaba()" [loading]="syncing()" />
      </ng-template>
    </p-dialog>

    <!-- Update Token Dialog -->
    <p-dialog header="Update Access Token" [(visible)]="showTokenDialog" [modal]="true" [style]="{ width: '30rem' }">
      <div class="flex flex-col gap-4 pt-4">
        <div class="bg-surface-100 rounded-lg p-3">
          <p class="text-xs text-surface-500">Account</p>
          <p class="text-sm font-semibold">{{ tokenDialogAccount?.name }} ({{ tokenDialogAccount?.wabaId }})</p>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">New Access Token</label>
          <input pInputText [(ngModel)]="newTokenValue" class="w-full" type="password" placeholder="EAAxxxxxxxx..." />
          <small class="text-surface-400">This will replace the existing token for this WABA account</small>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" (onClick)="showTokenDialog = false" />
        <p-button label="Update Token" icon="pi pi-key" severity="warn" (onClick)="updateToken()" [loading]="syncing()" />
      </ng-template>
    </p-dialog>

    <!-- Register Number for Tenant Dialog -->
    <p-dialog header="Register Number for Tenant" [(visible)]="showRegisterForTenantDialog" [modal]="true" [style]="{ width: '32rem' }">
      <div class="flex flex-col gap-4 pt-4">
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p class="text-xs text-blue-700">
            <i class="pi pi-info-circle mr-1"></i>
            This will register the number under the platform's shared WABA and assign it to the tenant.
            The number will be checked against Meta's API for existing WhatsApp Business registration.
          </p>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Phone Number</label>
          <input pInputText [(ngModel)]="registerForTenantPhone" class="w-full" placeholder="+91XXXXXXXXXX" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Tenant ID</label>
          <input pInputText [(ngModel)]="registerForTenantId" class="w-full" placeholder="Tenant UUID" />
        </div>
        @if (registerForTenantResult()) {
          <p-tag
            [value]="registerForTenantResult()!.message"
            [severity]="registerForTenantResult()!.status === 'registered' ? 'success' : 'warn'"
            styleClass="w-full text-left whitespace-normal py-2"
          />
        }
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" (onClick)="showRegisterForTenantDialog = false; registerForTenantResult.set(null)" />
        <p-button label="Register" icon="pi pi-check" severity="success" (onClick)="registerNumberForTenant()" [loading]="syncing()" />
      </ng-template>
    </p-dialog>

    <!-- Assign Phone Dialog -->
    <p-dialog header="Assign Phone to Tenant" [(visible)]="showAssignDialog" [modal]="true" [style]="{ width: '25rem' }">
      <div class="flex flex-col gap-4 pt-4">
        <div>
          <label class="block text-sm font-medium mb-1">Tenant ID</label>
          <input pInputText [(ngModel)]="assignTenantId" class="w-full" placeholder="Tenant UUID" />
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" (onClick)="showAssignDialog = false" />
        <p-button label="Assign" icon="pi pi-check" (onClick)="confirmAssignPhone()" />
      </ng-template>
    </p-dialog>
  `,
})
export class WabaDashboardComponent implements OnInit {
  private readonly wabaService = inject(WabaService);
  private readonly messageService = inject(MessageService);

  accounts = signal<WabaAccount[]>([]);
  phones = signal<WabaPhoneNumber[]>([]);
  templates = signal<WabaTemplate[]>([]);
  qualitySummary = signal<QualitySummary | null>(null);
  auditLogs = signal<any[]>([]);
  loading = signal(false);
  syncing = signal(false);

  showSyncDialog = false;
  showAssignDialog = false;
  showAddWabaDialog = false;
  showTokenDialog = false;
  syncWabaId = '';
  syncAccessToken = '';
  assignTenantId = '';
  selectedPhone: WabaPhoneNumber | null = null;
  showRegisterForTenantDialog = false;
  registerForTenantPhone = '';
  registerForTenantId = '';
  registerForTenantResult = signal<{ status: string; message: string } | null>(null);
  tokenDialogAccount: WabaAccount | null = null;
  newTokenValue = '';

  newWaba = {
    name: '',
    wabaId: '',
    businessId: '',
    accessToken: '',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
  };

  currencies = [
    { label: 'INR', value: 'INR' },
    { label: 'USD', value: 'USD' },
    { label: 'NGN', value: 'NGN' },
    { label: 'GHS', value: 'GHS' },
    { label: 'KES', value: 'KES' },
  ];

  timezones = [
    { label: 'Asia/Kolkata', value: 'Asia/Kolkata' },
    { label: 'UTC', value: 'UTC' },
    { label: 'America/New_York', value: 'America/New_York' },
    { label: 'Europe/London', value: 'Europe/London' },
    { label: 'Africa/Lagos', value: 'Africa/Lagos' },
  ];

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.loading.set(true);
    this.wabaService.getAccounts().subscribe({
      next: (accounts) => this.accounts.set(accounts),
      error: () => this.loading.set(false),
    });
    this.wabaService.getPhones().subscribe({
      next: (phones) => this.phones.set(phones),
    });
    this.wabaService.getTemplates().subscribe({
      next: (templates) => this.templates.set(templates),
    });
    this.wabaService.getQualitySummary().subscribe({
      next: (summary) => this.qualitySummary.set(summary),
    });
    this.wabaService.getAuditLogs({ limit: 50 }).subscribe({
      next: (res) => {
        this.auditLogs.set(res.data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  registerNumberForTenant(): void {
    if (!this.registerForTenantPhone || !this.registerForTenantId) {
      this.messageService.add({ severity: 'warn', summary: 'Please fill in both phone number and tenant ID' });
      return;
    }
    this.syncing.set(true);
    this.registerForTenantResult.set(null);

    this.wabaService.registerForTenant(this.registerForTenantPhone.trim(), this.registerForTenantId.trim()).subscribe({
      next: (result) => {
        this.syncing.set(false);
        this.registerForTenantResult.set(result);
        if (result.status === 'registered') {
          this.messageService.add({ severity: 'success', summary: 'Number registered!', detail: result.message });
          this.loadAll();
        }
      },
      error: (err) => {
        this.syncing.set(false);
        this.messageService.add({ severity: 'error', summary: 'Registration failed', detail: err.error?.message });
      },
    });
  }

  saveNewWaba(): void {
    if (!this.newWaba.wabaId || !this.newWaba.businessId || !this.newWaba.name) {
      this.messageService.add({ severity: 'warn', summary: 'Please fill in Name, WABA ID, and Business ID' });
      return;
    }
    this.syncing.set(true);

    // Step 1: Create the WABA account
    this.wabaService.createAccount({
      wabaId: this.newWaba.wabaId,
      name: this.newWaba.name,
      businessId: this.newWaba.businessId,
      currency: this.newWaba.currency,
      timezone: this.newWaba.timezone,
    } as any).subscribe({
      next: (waba) => {
        // Step 2: Store the access token if provided
        if (this.newWaba.accessToken) {
          this.wabaService.storeToken(waba.id, this.newWaba.accessToken, 'system_user').subscribe({
            next: () => {
              this.syncing.set(false);
              this.showAddWabaDialog = false;
              this.messageService.add({ severity: 'success', summary: 'WABA account created and token stored!' });
              this.newWaba = { name: '', wabaId: '', businessId: '', accessToken: '', currency: 'INR', timezone: 'Asia/Kolkata' };
              this.loadAll();
            },
            error: (err) => {
              this.syncing.set(false);
              this.messageService.add({ severity: 'warn', summary: 'Account created but token failed', detail: err.error?.message });
              this.showAddWabaDialog = false;
              this.loadAll();
            },
          });
        } else {
          this.syncing.set(false);
          this.showAddWabaDialog = false;
          this.messageService.add({ severity: 'success', summary: 'WABA account created (no token stored)' });
          this.newWaba = { name: '', wabaId: '', businessId: '', accessToken: '', currency: 'INR', timezone: 'Asia/Kolkata' };
          this.loadAll();
        }
      },
      error: (err) => {
        this.syncing.set(false);
        this.messageService.add({ severity: 'error', summary: 'Failed to create WABA', detail: err.error?.message });
      },
    });
  }

  openTokenDialog(account: WabaAccount): void {
    this.tokenDialogAccount = account;
    this.newTokenValue = '';
    this.showTokenDialog = true;
  }

  updateToken(): void {
    if (!this.tokenDialogAccount || !this.newTokenValue) return;
    this.syncing.set(true);
    this.wabaService.rotateToken(this.tokenDialogAccount.id, this.newTokenValue).subscribe({
      next: () => {
        this.syncing.set(false);
        this.showTokenDialog = false;
        this.messageService.add({ severity: 'success', summary: 'Access token updated!' });
      },
      error: (err) => {
        this.syncing.set(false);
        this.messageService.add({ severity: 'error', summary: 'Failed to update token', detail: err.error?.message });
      },
    });
  }

  syncWaba(): void {
    if (!this.syncWabaId || !this.syncAccessToken) return;
    this.syncing.set(true);
    this.wabaService.syncAccount(this.syncWabaId, this.syncAccessToken).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'WABA synced successfully' });
        this.showSyncDialog = false;
        this.syncing.set(false);
        this.loadAll();
      },
      error: (err) => {
        this.messageService.add({ severity: 'error', summary: 'Sync failed', detail: err.error?.message });
        this.syncing.set(false);
      },
    });
  }

  syncTemplates(): void {
    const firstAccount = this.accounts()[0];
    if (!firstAccount) return;
    this.loading.set(true);
    this.wabaService.syncTemplates(firstAccount.id).subscribe({
      next: (res) => {
        this.messageService.add({ severity: 'success', summary: `Synced ${res.synced} templates (${res.added} new, ${res.updated} updated)` });
        this.loadAll();
      },
      error: () => this.loading.set(false),
    });
  }

  openAssignDialog(phone: WabaPhoneNumber): void {
    this.selectedPhone = phone;
    this.assignTenantId = '';
    this.showAssignDialog = true;
  }

  confirmAssignPhone(): void {
    if (!this.selectedPhone || !this.assignTenantId) return;
    this.wabaService.assignPhone(this.selectedPhone.id, this.assignTenantId).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Phone assigned successfully' });
        this.showAssignDialog = false;
        this.loadAll();
      },
      error: (err) => {
        this.messageService.add({ severity: 'error', summary: 'Assignment failed', detail: err.error?.message });
      },
    });
  }

  unassignPhone(phone: WabaPhoneNumber): void {
    this.wabaService.unassignPhone(phone.id).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Phone unassigned' });
        this.loadAll();
      },
    });
  }

  togglePhoneStatus(phone: WabaPhoneNumber): void {
    const newStatus = phone.status === 'active' ? 'inactive' : 'active';
    this.wabaService.updatePhoneStatus(phone.id, newStatus).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: `Phone ${newStatus === 'active' ? 'activated' : 'deactivated'}` });
        this.loadAll();
      },
      error: (err) => {
        this.messageService.add({ severity: 'error', summary: 'Failed to update status', detail: err.error?.message });
      },
    });
  }

  openOnboardDialog(phone: WabaPhoneNumber): void {
    // For now, just start onboarding if tenant is assigned
    if (phone.tenantId) {
      this.wabaService.startOnboarding(phone.id, phone.tenantId).subscribe({
        next: (status) => {
          this.messageService.add({ severity: 'info', summary: `Onboarding started: ${status.step}` });
        },
      });
    } else {
      this.messageService.add({ severity: 'warn', summary: 'Assign to a tenant first' });
    }
  }

  deleteTemplate(tmpl: WabaTemplate): void {
    this.wabaService.deleteTemplate(tmpl.id).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Template deleted' });
        this.loadAll();
      },
    });
  }
}
