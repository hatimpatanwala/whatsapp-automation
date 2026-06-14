import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
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
    TableModule, ButtonModule, TagModule, TabsModule,
    DialogModule, InputTextModule, SelectModule, ToastModule,
    ProgressBarModule, TooltipModule, ToggleSwitchModule,
  ],
  providers: [MessageService],
  template: `
    <p-toast />

    <div class="p-6 space-y-6">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">WABA Management</h1>
          <p class="text-gray-500 text-sm mt-1">Manage WhatsApp Business Accounts, phone numbers and templates</p>
        </div>
      </div>

      <!-- Summary Cards -->
      <div class="grid grid-cols-2 xl:grid-cols-4 gap-4">
        @for (card of [
          { label: 'WABA Accounts', value: accounts().length, icon: 'pi-whatsapp', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Phone Numbers', value: phones().length, icon: 'pi-phone', color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'Green Quality', value: qualitySummary()?.green || 0, icon: 'pi-check-circle', color: 'text-green-400', bg: 'bg-green-500/10' },
          { label: 'Templates', value: templates().length, icon: 'pi-file', color: 'text-amber-400', bg: 'bg-amber-500/10' }
        ]; track card.label) {
          <div class="bg-white shadow-sm rounded-xl p-5 border border-gray-200">
            <div class="flex items-start justify-between">
              <div>
                <p class="text-xs text-gray-500 font-medium uppercase tracking-wider">{{ card.label }}</p>
                <p class="text-2xl font-bold text-gray-900 mt-1">{{ card.value }}</p>
              </div>
              <div [class]="'w-10 h-10 rounded-lg flex items-center justify-center ' + card.bg">
                <i [class]="'pi ' + card.icon + ' ' + card.color" style="font-size:1.1rem"></i>
              </div>
            </div>
          </div>
        }
      </div>

      <!-- Tabs -->
      <p-tabs value="0">
        <p-tablist>
          <p-tab value="0"><i class="pi pi-whatsapp mr-1.5" style="font-size:0.8rem"></i>Accounts</p-tab>
          <p-tab value="1"><i class="pi pi-phone mr-1.5" style="font-size:0.8rem"></i>Phone Numbers</p-tab>
          <p-tab value="2"><i class="pi pi-file mr-1.5" style="font-size:0.8rem"></i>Templates</p-tab>
          <p-tab value="3"><i class="pi pi-chart-bar mr-1.5" style="font-size:0.8rem"></i>Quality</p-tab>
          <p-tab value="4"><i class="pi pi-history mr-1.5" style="font-size:0.8rem"></i>Audit Logs</p-tab>
        </p-tablist>
        <p-tabpanels>

          <!-- ═══ WABA Accounts Tab ═══ -->
          <p-tabpanel value="0">
            <div class="pt-4">
              <div class="flex justify-end mb-4 gap-2">
                <button pButton label="Add WABA Account" icon="pi pi-plus" severity="success" class="p-button-sm" (click)="showAddWabaDialog = true"></button>
                <button pButton label="Sync from Meta" icon="pi pi-sync" class="p-button-sm p-button-outlined" (click)="showSyncDialog = true"></button>
              </div>
              <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <p-table [value]="accounts()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="text-sm">
                  <ng-template pTemplate="header">
                    <tr>
                      <th class="text-xs text-gray-500 font-medium">NAME</th>
                      <th class="text-xs text-gray-500 font-medium">WABA ID</th>
                      <th class="text-xs text-gray-500 font-medium">CURRENCY</th>
                      <th class="text-xs text-gray-500 font-medium">MESSAGING TIER</th>
                      <th class="text-xs text-gray-500 font-medium">VERIFICATION</th>
                      <th class="text-xs text-gray-500 font-medium">STATUS</th>
                      <th class="text-xs text-gray-500 font-medium">PHONES</th>
                      <th class="text-xs text-gray-500 font-medium">ACTIONS</th>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="body" let-account>
                    <tr>
                      <td class="font-semibold text-gray-900">{{ account.name }}</td>
                      <td><span class="font-mono text-xs text-gray-500">{{ account.wabaId }}</span></td>
                      <td class="text-gray-600">{{ account.currency }}</td>
                      <td><p-tag [value]="account.messagingLimitTier || 'N/A'" severity="info" styleClass="text-xs" /></td>
                      <td><p-tag [value]="account.metaBusinessVerification || 'pending'" [severity]="account.metaBusinessVerification === 'verified' ? 'success' : 'warn'" styleClass="text-xs capitalize" /></td>
                      <td><p-tag [value]="account.status" [severity]="account.status === 'active' ? 'success' : 'danger'" styleClass="text-xs capitalize" /></td>
                      <td class="text-gray-600">{{ account.phoneNumbers?.length || 0 }}</td>
                      <td>
                        <div class="flex items-center gap-1">
                          <button pButton icon="pi pi-sync" class="p-button-text p-button-sm p-button-rounded text-blue-400" pTooltip="Re-sync from Meta" (click)="resyncAccount(account)"></button>
                          <button pButton icon="pi pi-key" class="p-button-text p-button-sm p-button-rounded text-amber-400" pTooltip="Update Token" (click)="openTokenDialog(account)"></button>
                          <button pButton icon="pi pi-trash" class="p-button-text p-button-sm p-button-rounded text-red-400" pTooltip="Delete account" (click)="openDeleteDialog(account)"></button>
                        </div>
                      </td>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="emptymessage">
                    <tr><td colspan="8" class="text-center py-12 text-gray-500">
                      <i class="pi pi-whatsapp" style="font-size:2rem"></i>
                      <p class="mt-2">No WABA accounts. Add one or sync from Meta.</p>
                    </td></tr>
                  </ng-template>
                </p-table>
              </div>
            </div>
          </p-tabpanel>

          <!-- ═══ Phone Numbers Tab ═══ -->
          <p-tabpanel value="1">
            <div class="pt-4">
              <div class="flex justify-end mb-4">
                <button pButton label="Register for Tenant" icon="pi pi-plus" severity="success" class="p-button-sm" (click)="showRegisterForTenantDialog = true"></button>
              </div>
              <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <p-table [value]="phones()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="text-sm">
                  <ng-template pTemplate="header">
                    <tr>
                      <th class="text-xs text-gray-500 font-medium">PHONE</th>
                      <th class="text-xs text-gray-500 font-medium">DISPLAY NAME</th>
                      <th class="text-xs text-gray-500 font-medium">QUALITY</th>
                      <th class="text-xs text-gray-500 font-medium">LIMIT</th>
                      <th class="text-xs text-gray-500 font-medium">STATUS</th>
                      <th class="text-xs text-gray-500 font-medium">TENANT</th>
                      <th class="text-xs text-gray-500 font-medium">ACTIONS</th>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="body" let-phone>
                    <tr>
                      <td class="font-semibold text-gray-900">{{ phone.phoneNumber }}</td>
                      <td class="text-gray-600">{{ phone.displayName || phone.verifiedName || '—' }}</td>
                      <td><p-tag [value]="phone.qualityRating || 'N/A'" [severity]="phone.qualityRating === 'GREEN' ? 'success' : phone.qualityRating === 'YELLOW' ? 'warn' : 'danger'" styleClass="text-xs" /></td>
                      <td class="text-gray-500 text-xs">{{ phone.messagingLimit || '—' }}</td>
                      <td><p-tag [value]="phone.status" [severity]="phone.status === 'active' ? 'success' : 'warn'" styleClass="text-xs capitalize" /></td>
                      <td class="text-gray-600">{{ phone.tenant?.name || '— Unassigned —' }}</td>
                      <td>
                        <div class="flex gap-1 items-center">
                          <p-toggleswitch [ngModel]="phone.status === 'active'" (onChange)="togglePhoneStatus(phone)" pTooltip="Toggle status" />
                          @if (!phone.tenantId) {
                            <button pButton label="Assign" icon="pi pi-link" class="p-button-sm p-button-outlined" severity="info" (click)="openAssignDialog(phone)"></button>
                          } @else {
                            <button pButton label="Unassign" icon="pi pi-times" class="p-button-sm p-button-outlined" severity="warn" (click)="unassignPhone(phone)"></button>
                          }
                          @if (phone.status !== 'active' && phone.tenantId) {
                            <button pButton icon="pi pi-play" class="p-button-sm p-button-text" pTooltip="Onboard" (click)="openOnboardDialog(phone)"></button>
                          }
                        </div>
                      </td>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="emptymessage">
                    <tr><td colspan="7" class="text-center py-12 text-gray-500">
                      <i class="pi pi-phone" style="font-size:2rem"></i>
                      <p class="mt-2">No phone numbers. Sync a WABA account first.</p>
                    </td></tr>
                  </ng-template>
                </p-table>
              </div>
            </div>
          </p-tabpanel>

          <!-- ═══ Templates Tab ═══ -->
          <p-tabpanel value="2">
            <div class="pt-4">
              <div class="flex justify-end mb-4">
                @if (accounts().length > 0) {
                  <button pButton label="Sync Templates from Meta" icon="pi pi-sync" class="p-button-sm p-button-outlined" (click)="syncTemplates()"></button>
                }
              </div>
              <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <p-table [value]="templates()" [loading]="loading()" [paginator]="true" [rows]="15" styleClass="text-sm">
                  <ng-template pTemplate="header">
                    <tr>
                      <th class="text-xs text-gray-500 font-medium">TEMPLATE</th>
                      <th class="text-xs text-gray-500 font-medium">CATEGORY</th>
                      <th class="text-xs text-gray-500 font-medium">LANGUAGE</th>
                      <th class="text-xs text-gray-500 font-medium">STATUS</th>
                      <th class="text-xs text-gray-500 font-medium">QUALITY</th>
                      <th class="text-xs text-gray-500 font-medium">SCOPE</th>
                      <th class="text-xs text-gray-500 font-medium">ACTIONS</th>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="body" let-tmpl>
                    <tr>
                      <td class="font-semibold text-gray-900">{{ tmpl.templateName }}</td>
                      <td><p-tag [value]="tmpl.category" severity="info" styleClass="text-xs" /></td>
                      <td class="text-gray-600">{{ tmpl.language }}</td>
                      <td><p-tag [value]="tmpl.status" [severity]="tmpl.status === 'APPROVED' ? 'success' : tmpl.status === 'REJECTED' ? 'danger' : 'warn'" styleClass="text-xs" /></td>
                      <td class="text-gray-500">{{ tmpl.qualityScore ?? '—' }}</td>
                      <td><span class="text-xs px-2 py-0.5 rounded-full" [class]="tmpl.tenantId ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'">{{ tmpl.tenantId ? 'Tenant' : 'Platform' }}</span></td>
                      <td>
                        <button pButton icon="pi pi-trash" class="p-button-text p-button-sm p-button-rounded text-red-400" pTooltip="Delete" (click)="deleteTemplate(tmpl)"></button>
                      </td>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="emptymessage">
                    <tr><td colspan="7" class="text-center py-12 text-gray-500">
                      <i class="pi pi-file" style="font-size:2rem"></i>
                      <p class="mt-2">No templates. Sync from Meta to populate.</p>
                    </td></tr>
                  </ng-template>
                </p-table>
              </div>
            </div>
          </p-tabpanel>

          <!-- ═══ Quality Monitor Tab ═══ -->
          <p-tabpanel value="3">
            <div class="pt-4">
              @if (qualitySummary(); as qs) {
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  @for (q of [
                    { label: 'Green', value: qs.green, color: 'text-green-600', bg: 'bg-green-500', pct: qs.total ? (qs.green / qs.total * 100) : 0 },
                    { label: 'Yellow', value: qs.yellow, color: 'text-yellow-600', bg: 'bg-yellow-500', pct: qs.total ? (qs.yellow / qs.total * 100) : 0 },
                    { label: 'Red', value: qs.red, color: 'text-red-600', bg: 'bg-red-500', pct: qs.total ? (qs.red / qs.total * 100) : 0 }
                  ]; track q.label) {
                    <div class="bg-white shadow-sm rounded-xl p-6 border border-gray-200 text-center">
                      <p class="text-3xl font-bold" [class]="q.color">{{ q.value }}</p>
                      <p class="text-gray-500 text-sm mt-1">{{ q.label }}</p>
                      <div class="mt-3 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div [class]="q.bg + ' h-full rounded-full transition-all'" [style.width.%]="q.pct"></div>
                      </div>
                      <p class="text-xs text-gray-400 mt-1">{{ q.pct | number:'1.0-0' }}% of total</p>
                    </div>
                  }
                </div>
              } @else {
                <div class="text-center py-16 text-gray-500">
                  <i class="pi pi-chart-bar" style="font-size:2rem"></i>
                  <p class="mt-2">No quality data available</p>
                </div>
              }
            </div>
          </p-tabpanel>

          <!-- ═══ Audit Logs Tab ═══ -->
          <p-tabpanel value="4">
            <div class="pt-4">
              <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <p-table [value]="auditLogs()" [loading]="loading()" [paginator]="true" [rows]="20" styleClass="text-sm">
                  <ng-template pTemplate="header">
                    <tr>
                      <th class="text-xs text-gray-500 font-medium">TIMESTAMP</th>
                      <th class="text-xs text-gray-500 font-medium">ACTOR</th>
                      <th class="text-xs text-gray-500 font-medium">ACTION</th>
                      <th class="text-xs text-gray-500 font-medium">RESOURCE</th>
                      <th class="text-xs text-gray-500 font-medium">DETAILS</th>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="body" let-log>
                    <tr>
                      <td class="text-xs text-gray-500">{{ log.createdAt | date:'short' }}</td>
                      <td><p-tag [value]="log.actorType" severity="info" styleClass="text-xs" /></td>
                      <td class="font-medium text-gray-900">{{ log.action }}</td>
                      <td class="text-gray-600">{{ log.resourceType }} <span class="font-mono text-xs text-gray-500">{{ log.resourceId?.substring(0, 8) }}</span></td>
                      <td class="text-xs text-gray-500 max-w-48 truncate">{{ log.details | json }}</td>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="emptymessage">
                    <tr><td colspan="5" class="text-center py-12 text-gray-500">
                      <i class="pi pi-history" style="font-size:2rem"></i>
                      <p class="mt-2">No audit logs yet</p>
                    </td></tr>
                  </ng-template>
                </p-table>
              </div>
            </div>
          </p-tabpanel>

        </p-tabpanels>
      </p-tabs>
    </div>

    <!-- ═══ Sync WABA Dialog ═══ -->
    <p-dialog header="Sync WABA from Meta" [(visible)]="showSyncDialog" [modal]="true" [style]="{ width: '30rem' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">WABA ID</label>
          <input pInputText [(ngModel)]="syncWabaId" placeholder="e.g. 123456789012345" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Access Token</label>
          <input pInputText [(ngModel)]="syncAccessToken" type="password" placeholder="System User Token" />
        </div>
      </div>
      <ng-template pTemplate="footer">
        <button pButton label="Cancel" class="p-button-text" (click)="showSyncDialog = false"></button>
        <button pButton label="Sync" icon="pi pi-sync" (click)="syncWaba()" [loading]="syncing()"></button>
      </ng-template>
    </p-dialog>

    <!-- ═══ Add WABA Account Dialog ═══ -->
    <p-dialog header="Add WABA Account" [(visible)]="showAddWabaDialog" [modal]="true" [style]="{ width: '35rem' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Account Name</label>
          <input pInputText [(ngModel)]="newWaba.name" placeholder="e.g. Platform WABA" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">WABA ID</label>
          <input pInputText [(ngModel)]="newWaba.wabaId" placeholder="e.g. 1642870743653301" />
          <span class="text-xs text-gray-400">Found in Meta Business Settings</span>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Business ID</label>
          <input pInputText [(ngModel)]="newWaba.businessId" placeholder="e.g. 935176145735575" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">System User Access Token</label>
          <input pInputText [(ngModel)]="newWaba.accessToken" type="password" placeholder="EAAxxxxxxxx..." />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Currency</label>
            <p-select [(ngModel)]="newWaba.currency" [options]="currencies" optionLabel="label" optionValue="value" styleClass="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Timezone</label>
            <p-select [(ngModel)]="newWaba.timezone" [options]="timezones" optionLabel="label" optionValue="value" styleClass="w-full" />
          </div>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <button pButton label="Cancel" class="p-button-text" (click)="showAddWabaDialog = false"></button>
        <button pButton label="Save & Store Token" icon="pi pi-check" severity="success" (click)="saveNewWaba()" [loading]="syncing()"></button>
      </ng-template>
    </p-dialog>

    <!-- ═══ Update Token Dialog ═══ -->
    <p-dialog header="Update Access Token" [(visible)]="showTokenDialog" [modal]="true" [style]="{ width: '30rem' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="bg-gray-100 rounded-lg p-3">
          <p class="text-xs text-gray-500">Account</p>
          <p class="text-sm font-semibold text-gray-900">{{ tokenDialogAccount?.name }} <span class="text-xs text-gray-500 font-mono">{{ tokenDialogAccount?.wabaId }}</span></p>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">New Access Token</label>
          <input pInputText [(ngModel)]="newTokenValue" type="password" placeholder="EAAxxxxxxxx..." />
          <span class="text-xs text-gray-400">This will replace the existing token</span>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <button pButton label="Cancel" class="p-button-text" (click)="showTokenDialog = false"></button>
        <button pButton label="Update Token" icon="pi pi-key" severity="warn" (click)="updateToken()" [loading]="syncing()"></button>
      </ng-template>
    </p-dialog>

    <!-- ═══ Register Number for Tenant Dialog ═══ -->
    <p-dialog header="Register Number for Tenant" [(visible)]="showRegisterForTenantDialog" [modal]="true" [style]="{ width: '32rem' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p class="text-xs text-blue-700">
            <i class="pi pi-info-circle mr-1"></i>
            This will register the number under the platform's shared WABA and assign it to the tenant.
          </p>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Phone Number</label>
          <input pInputText [(ngModel)]="registerForTenantPhone" placeholder="+91XXXXXXXXXX" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Tenant ID</label>
          <input pInputText [(ngModel)]="registerForTenantId" placeholder="Tenant UUID" />
        </div>
        @if (registerForTenantResult()) {
          <div class="rounded-lg p-3" [class]="registerForTenantResult()!.status === 'registered' ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'">
            <p class="text-sm" [class]="registerForTenantResult()!.status === 'registered' ? 'text-green-700' : 'text-amber-700'">{{ registerForTenantResult()!.message }}</p>
          </div>
        }
      </div>
      <ng-template pTemplate="footer">
        <button pButton label="Cancel" class="p-button-text" (click)="showRegisterForTenantDialog = false; registerForTenantResult.set(null)"></button>
        <button pButton label="Register" icon="pi pi-check" severity="success" (click)="registerNumberForTenant()" [loading]="syncing()"></button>
      </ng-template>
    </p-dialog>

    <!-- ═══ Assign Phone Dialog ═══ -->
    <p-dialog header="Assign Phone to Tenant" [(visible)]="showAssignDialog" [modal]="true" [style]="{ width: '25rem' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Tenant ID</label>
          <input pInputText [(ngModel)]="assignTenantId" placeholder="Tenant UUID" />
        </div>
      </div>
      <ng-template pTemplate="footer">
        <button pButton label="Cancel" class="p-button-text" (click)="showAssignDialog = false"></button>
        <button pButton label="Assign" icon="pi pi-check" severity="success" (click)="confirmAssignPhone()"></button>
      </ng-template>
    </p-dialog>

    <!-- ═══ Delete WABA Account Dialog ═══ -->
    <p-dialog header="Delete WABA Account" [(visible)]="showDeleteDialog" [modal]="true" [style]="{ width: '30rem' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="bg-red-50 border border-red-200 rounded-lg p-3">
          <p class="text-sm text-red-700">
            <i class="pi pi-exclamation-triangle mr-1"></i>
            This permanently removes the account along with its stored token, phone numbers and synced templates. This cannot be undone.
          </p>
        </div>
        <div class="bg-gray-100 rounded-lg p-3">
          <p class="text-xs text-gray-500">Account</p>
          <p class="text-sm font-semibold text-gray-900">{{ deleteTarget?.name }} <span class="text-xs text-gray-500 font-mono">{{ deleteTarget?.wabaId }}</span></p>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <button pButton label="Cancel" class="p-button-text" (click)="showDeleteDialog = false"></button>
        <button pButton label="Delete" icon="pi pi-trash" severity="danger" (click)="confirmDeleteWaba()" [loading]="syncing()"></button>
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
  showDeleteDialog = false;
  deleteTarget: WabaAccount | null = null;

  newWaba = { name: '', wabaId: '', businessId: '', accessToken: '', currency: 'INR', timezone: 'Asia/Kolkata' };
  currencies = [{ label: 'INR', value: 'INR' }, { label: 'USD', value: 'USD' }, { label: 'NGN', value: 'NGN' }, { label: 'GHS', value: 'GHS' }, { label: 'KES', value: 'KES' }];
  timezones = [{ label: 'Asia/Kolkata', value: 'Asia/Kolkata' }, { label: 'UTC', value: 'UTC' }, { label: 'America/New_York', value: 'America/New_York' }, { label: 'Europe/London', value: 'Europe/London' }, { label: 'Africa/Lagos', value: 'Africa/Lagos' }];

  ngOnInit() { this.loadAll(); }

  loadAll() {
    this.loading.set(true);
    this.wabaService.getAccounts().subscribe({ next: (a) => this.accounts.set(a), error: () => this.loading.set(false) });
    this.wabaService.getPhones().subscribe({ next: (p) => this.phones.set(p) });
    this.wabaService.getTemplates().subscribe({ next: (t) => this.templates.set(t) });
    this.wabaService.getQualitySummary().subscribe({ next: (s) => this.qualitySummary.set(s) });
    this.wabaService.getAuditLogs({ limit: 50 }).subscribe({ next: (r) => { this.auditLogs.set(r.data); this.loading.set(false); }, error: () => this.loading.set(false) });
  }

  registerNumberForTenant() {
    if (!this.registerForTenantPhone || !this.registerForTenantId) { this.toast('warn', 'Fill in both fields'); return; }
    this.syncing.set(true);
    this.registerForTenantResult.set(null);
    this.wabaService.registerForTenant(this.registerForTenantPhone.trim(), this.registerForTenantId.trim()).subscribe({
      next: (r) => { this.syncing.set(false); this.registerForTenantResult.set(r); if (r.status === 'registered') { this.toast('success', 'Number registered!'); this.loadAll(); } },
      error: (e) => { this.syncing.set(false); this.toast('error', e.error?.message || 'Failed'); },
    });
  }

  saveNewWaba() {
    if (!this.newWaba.wabaId || !this.newWaba.businessId || !this.newWaba.name) { this.toast('warn', 'Fill required fields'); return; }
    this.syncing.set(true);
    // Pass the token so the backend auto-syncs (stores token + pulls phone numbers) on first add.
    this.wabaService.createAccount({
      wabaId: this.newWaba.wabaId,
      name: this.newWaba.name,
      businessId: this.newWaba.businessId,
      currency: this.newWaba.currency,
      timezone: this.newWaba.timezone,
      accessToken: this.newWaba.accessToken || undefined,
    } as any).subscribe({
      next: (waba) => {
        this.syncing.set(false);
        this.showAddWabaDialog = false;
        if (waba.syncWarning) {
          this.toast('warn', `Account created, but sync failed: ${waba.syncWarning}`);
        } else if (this.newWaba.accessToken) {
          this.toast('success', `WABA created & synced (${waba.syncedPhones ?? 0} phone number(s))`);
        } else {
          this.toast('success', 'WABA created');
        }
        this.newWaba = { name: '', wabaId: '', businessId: '', accessToken: '', currency: 'INR', timezone: 'Asia/Kolkata' };
        this.loadAll();
      },
      error: (e) => { this.syncing.set(false); this.toast('error', e.error?.message || 'Failed'); },
    });
  }

  openDeleteDialog(a: WabaAccount) { this.deleteTarget = a; this.showDeleteDialog = true; }
  confirmDeleteWaba() {
    if (!this.deleteTarget) return;
    this.syncing.set(true);
    this.wabaService.deleteAccount(this.deleteTarget.id).subscribe({
      next: () => { this.syncing.set(false); this.showDeleteDialog = false; this.toast('success', 'WABA account deleted'); this.deleteTarget = null; this.loadAll(); },
      error: (e) => { this.syncing.set(false); this.toast('error', e.error?.message || 'Delete failed'); },
    });
  }

  resyncAccount(a: WabaAccount) {
    this.toast('info', 'Re-syncing from Meta…');
    this.wabaService.resyncAccount(a.id).subscribe({
      next: (r) => { this.toast('success', `Re-synced (${r.syncedPhones ?? 0} phone number(s))`); this.loadAll(); },
      error: (e) => this.toast('error', e.error?.message || 'Re-sync failed'),
    });
  }

  openTokenDialog(a: WabaAccount) { this.tokenDialogAccount = a; this.newTokenValue = ''; this.showTokenDialog = true; }
  updateToken() {
    if (!this.tokenDialogAccount || !this.newTokenValue) return;
    this.syncing.set(true);
    this.wabaService.rotateToken(this.tokenDialogAccount.id, this.newTokenValue).subscribe({
      next: () => { this.syncing.set(false); this.showTokenDialog = false; this.toast('success', 'Token updated'); },
      error: (e) => { this.syncing.set(false); this.toast('error', e.error?.message || 'Failed'); },
    });
  }

  syncWaba() {
    if (!this.syncWabaId || !this.syncAccessToken) return;
    this.syncing.set(true);
    this.wabaService.syncAccount(this.syncWabaId, this.syncAccessToken).subscribe({
      next: () => { this.toast('success', 'WABA synced'); this.showSyncDialog = false; this.syncing.set(false); this.loadAll(); },
      error: (e) => { this.toast('error', e.error?.message || 'Sync failed'); this.syncing.set(false); },
    });
  }

  syncTemplates() {
    const a = this.accounts()[0]; if (!a) return;
    this.loading.set(true);
    this.wabaService.syncTemplates(a.id).subscribe({
      next: (r) => { this.toast('success', `Synced ${r.synced} templates`); this.loadAll(); },
      error: () => this.loading.set(false),
    });
  }

  openAssignDialog(p: WabaPhoneNumber) { this.selectedPhone = p; this.assignTenantId = ''; this.showAssignDialog = true; }
  confirmAssignPhone() {
    if (!this.selectedPhone || !this.assignTenantId) return;
    this.wabaService.assignPhone(this.selectedPhone.id, this.assignTenantId).subscribe({
      next: () => { this.toast('success', 'Assigned'); this.showAssignDialog = false; this.loadAll(); },
      error: (e) => this.toast('error', e.error?.message || 'Failed'),
    });
  }
  unassignPhone(p: WabaPhoneNumber) { this.wabaService.unassignPhone(p.id).subscribe({ next: () => { this.toast('success', 'Unassigned'); this.loadAll(); } }); }
  togglePhoneStatus(p: WabaPhoneNumber) {
    const s = p.status === 'active' ? 'inactive' : 'active';
    this.wabaService.updatePhoneStatus(p.id, s).subscribe({ next: () => { this.toast('success', `Phone ${s}`); this.loadAll(); }, error: (e) => { this.toast('error', e.error?.message || 'Failed'); this.loadAll(); } });
  }
  openOnboardDialog(p: WabaPhoneNumber) {
    if (p.tenantId) { this.wabaService.startOnboarding(p.id, p.tenantId).subscribe({ next: (s) => this.toast('info', `Onboarding: ${s.step}`) }); }
    else { this.toast('warn', 'Assign to tenant first'); }
  }
  deleteTemplate(t: WabaTemplate) { this.wabaService.deleteTemplate(t.id).subscribe({ next: () => { this.toast('success', 'Deleted'); this.loadAll(); } }); }

  private toast(severity: string, detail: string) { this.messageService.add({ severity, summary: severity === 'error' ? 'Error' : severity === 'success' ? 'Success' : severity === 'warn' ? 'Warning' : 'Info', detail, life: 3000 }); }
}
