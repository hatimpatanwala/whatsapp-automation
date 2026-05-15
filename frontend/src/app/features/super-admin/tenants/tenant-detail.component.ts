import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TabsModule } from 'primeng/tabs';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ToastModule } from 'primeng/toast';
import { DividerModule } from 'primeng/divider';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { DatePickerModule } from 'primeng/datepicker';
import { ProgressBarModule } from 'primeng/progressbar';
import { MessageService } from 'primeng/api';
import { TenantService } from '../../../core/services/tenant.service';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { ApiService } from '../../../core/services/api.service';

const FEATURE_LABELS: Record<string, { label: string; desc: string; icon: string }> = {
  deliveries: { label: 'Deliveries', desc: 'Delivery tracking and courier management', icon: 'pi-truck' },
  customers: { label: 'Customers', desc: 'Customer management and segmentation', icon: 'pi-users' },
  campaigns: { label: 'Campaigns', desc: 'Broadcast and drip campaigns', icon: 'pi-megaphone' },
  conversations: { label: 'Conversations', desc: 'WhatsApp inbox and chat', icon: 'pi-comments' },
  whatsappCatalog: { label: 'WhatsApp Catalog', desc: 'Product catalog sync', icon: 'pi-shopping-bag' },
  workflowBuilder: { label: 'Workflow Builder', desc: 'Visual automation builder', icon: 'pi-sitemap' },
  aiFeatures: { label: 'AI Features', desc: 'Chatbot and smart replies', icon: 'pi-sparkles' },
  advancedAnalytics: { label: 'Advanced Analytics', desc: 'In-depth reports', icon: 'pi-chart-bar' },
  multiCatalog: { label: 'Multi-Catalog', desc: 'Multiple product catalogs', icon: 'pi-th-large' },
};

@Component({
  selector: 'wa-tenant-detail',
  standalone: true,
  imports: [
    CommonModule, RouterLink, FormsModule,
    ButtonModule, TagModule, TabsModule, TableModule,
    InputTextModule, InputNumberModule, TextareaModule, SelectModule,
    ToggleSwitchModule, ToastModule, DividerModule, TooltipModule,
    DialogModule, DatePickerModule, ProgressBarModule,
  ],
  providers: [MessageService],
  template: `
    <div class="p-6">
      <p-toast />

      <!-- Breadcrumb + Header -->
      <div class="flex items-center gap-2 text-xs text-gray-400 mb-4">
        <a routerLink="/admin/dashboard" class="hover:text-gray-900 no-underline text-gray-400">Dashboard</a>
        <i class="pi pi-chevron-right" style="font-size:0.5rem"></i>
        <a routerLink="/admin/tenants" class="hover:text-gray-900 no-underline text-gray-400">Tenants</a>
        <i class="pi pi-chevron-right" style="font-size:0.5rem"></i>
        <span class="text-gray-900">{{ tenant()?.name || '...' }}</span>
      </div>

      <div class="flex items-center gap-4 mb-6">
        <button pButton icon="pi pi-arrow-left" class="p-button-text p-button-rounded text-gray-500" routerLink="/admin/tenants"></button>
        <div class="flex-1">
          <div class="flex items-center gap-3">
            <h1 class="text-2xl font-bold text-gray-900">{{ tenant()?.name || 'Loading...' }}</h1>
            @if (tenant()) {
              <p-tag [value]="tenant()!.status" [severity]="getStatusSeverity(tenant()!.status)" styleClass="text-xs capitalize" />
            }
          </div>
          <p class="text-gray-500 text-sm">&#64;{{ tenant()?.slug }} &middot; <span class="font-mono text-xs">{{ tenant()?.schemaName }}</span></p>
        </div>
        <div class="flex gap-2">
          @if (tenant()?.status === 'active') {
            <button pButton label="Suspend" icon="pi pi-ban" severity="danger" size="small" (click)="suspendTenant()"></button>
          } @else if (tenant()?.status === 'suspended') {
            <button pButton label="Activate" icon="pi pi-play" severity="success" size="small" (click)="activateTenant()"></button>
          }
          <button pButton label="Edit" icon="pi pi-pencil" severity="secondary" size="small" [routerLink]="['/admin/tenants', tenantId, 'edit']"></button>
        </div>
      </div>

      @if (loading()) {
        <div class="text-center py-20 text-gray-500">
          <i class="pi pi-spinner pi-spin" style="font-size:2rem"></i>
          <p class="mt-3">Loading tenant details...</p>
        </div>
      } @else if (tenant()) {

        <!-- Quick Stats Row -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div class="bg-white rounded-xl p-4 border border-gray-200">
            <p class="text-xs text-gray-500 uppercase tracking-wider font-medium">Plan</p>
            <p class="text-gray-900 font-bold mt-1 capitalize">{{ activeSub()?.planName || activeSub()?.plan || 'None' }}</p>
          </div>
          <div class="bg-white rounded-xl p-4 border border-gray-200">
            <p class="text-xs text-gray-500 uppercase tracking-wider font-medium">Conversations</p>
            <p class="text-gray-900 font-bold mt-1">{{ activeSub()?.conversationsUsed || 0 }} <span class="text-gray-500 text-xs font-normal">/ {{ activeSub()?.maxConversations || '—' }}</span></p>
          </div>
          <div class="bg-white rounded-xl p-4 border border-gray-200">
            <p class="text-xs text-gray-500 uppercase tracking-wider font-medium">WhatsApp</p>
            <p class="text-gray-900 font-bold mt-1 text-sm">{{ tenant()!.whatsappPhone || 'Not connected' }}</p>
          </div>
          <div class="bg-white rounded-xl p-4 border border-gray-200">
            <p class="text-xs text-gray-500 uppercase tracking-wider font-medium">Workflows</p>
            <p class="text-gray-900 font-bold mt-1">{{ workflows().length }}</p>
          </div>
          <div class="bg-white rounded-xl p-4 border border-gray-200">
            <p class="text-xs text-gray-500 uppercase tracking-wider font-medium">Expires</p>
            <p class="text-gray-900 font-bold mt-1 text-sm">{{ activeSub()?.validUntil ? (activeSub()!.validUntil | date:'mediumDate') : 'Never' }}</p>
          </div>
        </div>

        <p-tabs value="0">
          <p-tablist>
            <p-tab value="0"><i class="pi pi-info-circle mr-1.5" style="font-size:0.8rem"></i>Overview</p-tab>
            <p-tab value="1"><i class="pi pi-star mr-1.5" style="font-size:0.8rem"></i>Plan & Billing</p-tab>
            <p-tab value="2"><i class="pi pi-shield mr-1.5" style="font-size:0.8rem"></i>Features</p-tab>
            <p-tab value="3"><i class="pi pi-sitemap mr-1.5" style="font-size:0.8rem"></i>Workflows</p-tab>
            <p-tab value="4"><i class="pi pi-phone mr-1.5" style="font-size:0.8rem"></i>Phones</p-tab>
            <p-tab value="5"><i class="pi pi-cog mr-1.5" style="font-size:0.8rem"></i>Settings</p-tab>
          </p-tablist>
          <p-tabpanels>

            <!-- ════════ TAB 0: Overview ════════ -->
            <p-tabpanel value="0">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                <div class="bg-white rounded-xl p-6 border border-gray-200">
                  <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Business Info</h3>
                  <div class="space-y-3">
                    @for (field of [
                      {l:'Name', v:tenant()!.name},
                      {l:'Business Name', v:tenant()!.businessName},
                      {l:'Category', v:tenant()!.businessCategory},
                      {l:'Description', v:tenant()!.businessDescription},
                      {l:'Address', v:tenant()!.businessAddress}
                    ]; track field.l) {
                      <div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
                        <span class="text-xs text-gray-500">{{ field.l }}</span>
                        <span class="text-sm text-gray-900 text-right max-w-[60%] truncate">{{ field.v || '—' }}</span>
                      </div>
                    }
                  </div>
                </div>
                <div class="bg-white rounded-xl p-6 border border-gray-200">
                  <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">WhatsApp Config</h3>
                  <div class="space-y-3">
                    @for (field of [
                      {l:'Phone', v:tenant()!.whatsappPhone},
                      {l:'Phone Number ID', v:tenant()!.phoneNumberId},
                      {l:'WABA ID', v:tenant()!.wabaId},
                      {l:'Schema', v:tenant()!.schemaName},
                      {l:'Onboarding', v:tenant()!.onboardingStatus}
                    ]; track field.l) {
                      <div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
                        <span class="text-xs text-gray-500">{{ field.l }}</span>
                        <span class="text-sm text-gray-900 font-mono text-right max-w-[60%] truncate">{{ field.v || '—' }}</span>
                      </div>
                    }
                  </div>
                </div>
              </div>
            </p-tabpanel>

            <!-- ════════ TAB 1: Plan & Billing ════════ -->
            <p-tabpanel value="1">
              <div class="pt-4 space-y-6">
                <!-- Active subscription card -->
                @if (activeSub()) {
                  <div class="bg-gradient-to-r from-emerald-50 to-emerald-50/80 rounded-xl p-6 border border-gray-200">
                    <div class="flex items-center justify-between mb-4">
                      <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg bg-primary-600 flex items-center justify-center">
                          <i class="pi pi-star-fill text-white"></i>
                        </div>
                        <div>
                          <h3 class="text-lg font-bold text-gray-900 capitalize">{{ activeSub()!.planName || activeSub()!.plan }} Plan</h3>
                          <p class="text-xs text-gray-500">Active since {{ activeSub()!.validFrom | date:'mediumDate' }}</p>
                        </div>
                      </div>
                      <p-tag [value]="activeSub()!.status" severity="success" styleClass="text-xs capitalize" />
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                      <div class="bg-gray-100 rounded-lg p-3">
                        <p class="text-[11px] text-gray-500 uppercase font-medium">Conversations</p>
                        <p class="text-gray-900 font-bold">{{ activeSub()!.conversationsUsed }} / {{ activeSub()!.maxConversations }}</p>
                      </div>
                      <div class="bg-gray-100 rounded-lg p-3">
                        <p class="text-[11px] text-gray-500 uppercase font-medium">Max Products</p>
                        <p class="text-gray-900 font-bold">{{ activeSub()!.maxProducts }}</p>
                      </div>
                      <div class="bg-gray-100 rounded-lg p-3">
                        <p class="text-[11px] text-gray-500 uppercase font-medium">Campaigns/mo</p>
                        <p class="text-gray-900 font-bold">{{ activeSub()!.maxCampaignsPerMonth }}</p>
                      </div>
                      <div class="bg-gray-100 rounded-lg p-3">
                        <p class="text-[11px] text-gray-500 uppercase font-medium">Expires</p>
                        <p class="text-gray-900 font-bold text-sm">{{ activeSub()!.validUntil ? (activeSub()!.validUntil | date:'mediumDate') : 'Never' }}</p>
                      </div>
                    </div>
                  </div>
                }

                <!-- Change / Assign Plan -->
                <div class="bg-white rounded-xl p-6 border border-gray-200">
                  <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                    {{ activeSub() ? 'Change Plan' : 'Assign Plan' }}
                  </h3>
                  <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div class="flex flex-col gap-1">
                      <label class="text-xs text-gray-500">Plan</label>
                      <p-select [(ngModel)]="selectedPlanId" [options]="planOptions()" optionLabel="label" optionValue="value" placeholder="Choose a plan" styleClass="w-full" />
                    </div>
                    <div class="flex flex-col gap-1">
                      <label class="text-xs text-gray-500">Expiry Date</label>
                      <p-datepicker [(ngModel)]="planExpiry" [showIcon]="true" [minDate]="minDate" dateFormat="yy-mm-dd" placeholder="No expiry" styleClass="w-full" />
                    </div>
                    <button pButton [label]="activeSub() ? 'Change Plan' : 'Assign'" icon="pi pi-check" severity="success" class="p-button-sm" [loading]="assigningPlan()" [disabled]="!selectedPlanId" (click)="assignPlan()"></button>
                    <button pButton label="Create Custom Plan" icon="pi pi-plus" class="p-button-sm p-button-outlined" style="color:#00A884;border-color:#00A884" (click)="showCustomPlanDialog = true"></button>
                  </div>
                </div>

                <!-- History -->
                @if (tenant()!.subscriptions?.length) {
                  <div class="bg-white rounded-xl p-6 border border-gray-200">
                    <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">History</h3>
                    <p-table [value]="tenant()!.subscriptions" styleClass="text-sm">
                      <ng-template pTemplate="header">
                        <tr class="bg-gray-50">
                          <th class="text-xs text-gray-500">Plan</th>
                          <th class="text-xs text-gray-500">Status</th>
                          <th class="text-xs text-gray-500">Used</th>
                          <th class="text-xs text-gray-500">From</th>
                          <th class="text-xs text-gray-500">Until</th>
                        </tr>
                      </ng-template>
                      <ng-template pTemplate="body" let-sub>
                        <tr class="border-t border-gray-200">
                          <td class="font-medium text-gray-900 capitalize">{{ sub.plan }}</td>
                          <td><p-tag [value]="sub.status" [severity]="sub.status==='active'?'success':'secondary'" styleClass="text-xs capitalize" /></td>
                          <td class="text-gray-600">{{ sub.conversationsUsed||0 }}/{{ sub.maxConversations }}</td>
                          <td class="text-gray-500 text-xs">{{ sub.validFrom|date:'mediumDate' }}</td>
                          <td class="text-gray-500 text-xs">{{ sub.validUntil?(sub.validUntil|date:'mediumDate'):'—' }}</td>
                        </tr>
                      </ng-template>
                    </p-table>
                  </div>
                }
              </div>
            </p-tabpanel>

            <!-- ════════ TAB 2: Features ════════ -->
            <p-tabpanel value="2">
              <div class="pt-4">
                <div class="bg-white rounded-xl p-6 border border-gray-200">
                  <div class="flex items-center justify-between mb-5">
                    <div>
                      <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider">Feature Access Control</h3>
                      <p class="text-xs text-gray-500 mt-1">Toggle features for this tenant. Overrides are saved as a custom plan.</p>
                    </div>
                    <button pButton label="Save" icon="pi pi-check" severity="success" size="small" [loading]="savingFeatures()" [disabled]="!activeSub()" (click)="saveFeatures()"></button>
                  </div>

                  @if (!activeSub()) {
                    <div class="text-center py-10 text-gray-500">
                      <i class="pi pi-exclamation-triangle" style="font-size:1.5rem"></i>
                      <p class="mt-2">Assign a plan first to manage feature access</p>
                    </div>
                  } @else {
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                      @for (feat of featureList; track feat.key) {
                        <div class="flex items-center justify-between py-3 border-b border-gray-200">
                          <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                              <i [class]="'pi ' + feat.icon + ' text-gray-500'" style="font-size:0.85rem"></i>
                            </div>
                            <div>
                              <p class="text-sm font-medium text-gray-700">{{ feat.label }}</p>
                              <p class="text-[10px] text-gray-500">{{ feat.desc }}</p>
                            </div>
                          </div>
                          <div class="flex items-center gap-2">
                            @if (featureOverrides[feat.key] !== planFeatures()[feat.key]) {
                              <span class="text-[9px] bg-amber-900/50 text-amber-300 border border-amber-800 px-1.5 py-0.5 rounded">override</span>
                            }
                            <p-toggleswitch [(ngModel)]="featureOverrides[feat.key]" />
                          </div>
                        </div>
                      }
                    </div>
                    <div class="mt-4 pt-3 border-t border-gray-200 flex items-center gap-3">
                      <button pButton label="Reset to Plan Defaults" icon="pi pi-refresh" class="p-button-text p-button-sm text-gray-500" (click)="resetFeaturesToPlan()"></button>
                      <span class="text-xs text-gray-400">Plan: {{ activeSub()!.planName || activeSub()!.plan }}</span>
                    </div>
                  }
                </div>
              </div>
            </p-tabpanel>

            <!-- ════════ TAB 3: Workflows ════════ -->
            <p-tabpanel value="3">
              <div class="pt-4">
                <div class="flex items-center justify-between mb-4">
                  <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider">Tenant Workflows</h3>
                  <div class="flex gap-2">
                    <button pButton label="Chat Simulator" icon="pi pi-comments" class="p-button-sm" severity="success" [routerLink]="['/admin/tenants', tenantId, 'simulator']"></button>
                    <button pButton label="Workflow Builder" icon="pi pi-external-link" class="p-button-sm" severity="info" [routerLink]="['/admin/tenants', tenantId, 'workflows']"></button>
                  </div>
                </div>
                @if (workflowsLoading()) {
                  <div class="text-center py-12 text-gray-500"><i class="pi pi-spinner pi-spin" style="font-size:1.5rem"></i><p class="mt-2">Loading workflows...</p></div>
                } @else if (!workflows().length) {
                  <div class="text-center py-16 text-gray-500">
                    <i class="pi pi-sitemap" style="font-size:2.5rem"></i>
                    <p class="mt-3 text-gray-500">No workflows created by this tenant</p>
                    <button pButton label="Create First Workflow" icon="pi pi-plus" severity="success" class="mt-3 p-button-sm" [routerLink]="['/admin/tenants', tenantId, 'workflows']"></button>
                  </div>
                } @else {
                  <div class="space-y-3">
                    @for (wf of workflows(); track wf.id) {
                      <div class="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 transition-colors">
                        <div class="flex items-center justify-between">
                          <div class="flex items-center gap-4">
                            <div class="w-10 h-10 rounded-lg flex items-center justify-center"
                              [class.bg-green-100]="wf.status==='active'"
                              [class.bg-gray-100]="wf.status!=='active'">
                              <i class="pi pi-sitemap" [class.text-green-600]="wf.status==='active'" [class.text-gray-500]="wf.status!=='active'" style="font-size:1.1rem"></i>
                            </div>
                            <div>
                              <h4 class="text-sm font-semibold text-gray-900">{{ wf.name }}</h4>
                              <p class="text-xs text-gray-500">{{ wf.description || 'No description' }}</p>
                            </div>
                          </div>
                          <div class="flex items-center gap-3">
                            <div class="text-right mr-4">
                              <p class="text-xs text-gray-500">{{ wf.execution_count || wf.executionCount || 0 }} runs</p>
                              <p class="text-[10px] text-gray-400">Updated {{ (wf.updated_at || wf.updatedAt) | date:'short' }}</p>
                            </div>
                            <p-tag [value]="wf.status" [severity]="wf.status==='active'?'success':wf.status==='paused'?'warn':'secondary'" styleClass="text-xs capitalize" />
                            <div class="flex gap-1">
                              <button pButton icon="pi pi-eye" class="p-button-text p-button-sm p-button-rounded text-gray-500" pTooltip="View/Edit Definition" (click)="openWorkflowEditor(wf)"></button>
                              <button pButton [icon]="wf.status==='active'?'pi pi-pause':'pi pi-play'" class="p-button-text p-button-sm p-button-rounded text-gray-500" [pTooltip]="wf.status==='active'?'Pause':'Activate'" (click)="toggleWorkflowStatus(wf)"></button>
                            </div>
                          </div>
                        </div>

                        <!-- Expanded workflow nodes preview -->
                        @if (wf.nodes?.length) {
                          <div class="mt-3 pt-3 border-t border-gray-200 flex flex-wrap gap-1.5">
                            @for (node of (wf.nodes || []).slice(0, 8); track node.id) {
                              <span class="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{{ node.label || node.type }}</span>
                            }
                            @if ((wf.nodes || []).length > 8) {
                              <span class="text-[10px] text-gray-400">+{{ wf.nodes.length - 8 }} more</span>
                            }
                          </div>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            </p-tabpanel>

            <!-- ════════ TAB 4: Phones ════════ -->
            <p-tabpanel value="4">
              <div class="pt-4">
                @if (tenant()!.phoneNumbers?.length) {
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    @for (phone of tenant()!.phoneNumbers; track phone.id) {
                      <div class="bg-white rounded-xl p-5 border border-gray-200">
                        <div class="flex items-center gap-3">
                          <div class="w-10 h-10 rounded-full flex items-center justify-center"
                            [class.bg-green-100]="phone.status==='active'"
                            [class.bg-gray-100]="phone.status!=='active'">
                            <i class="pi pi-phone" [class.text-green-600]="phone.status==='active'" [class.text-gray-500]="phone.status!=='active'"></i>
                          </div>
                          <div class="flex-1">
                            <p class="text-sm font-semibold text-gray-900">{{ phone.phoneNumber }}</p>
                            <p class="text-xs text-gray-500">{{ phone.displayName || phone.verifiedName || 'WhatsApp Business' }}</p>
                          </div>
                          <div class="text-right">
                            <p-tag [value]="phone.status" [severity]="phone.status==='active'?'success':'warn'" styleClass="text-xs" />
                            <p class="text-[10px] text-gray-400 mt-1">Quality: {{ phone.qualityRating || 'N/A' }}</p>
                          </div>
                        </div>
                      </div>
                    }
                  </div>
                } @else {
                  <div class="text-center py-16 text-gray-500">
                    <i class="pi pi-phone" style="font-size:2rem"></i>
                    <p class="mt-2">No phone numbers assigned</p>
                  </div>
                }
              </div>
            </p-tabpanel>

            <!-- ════════ TAB 5: Settings ════════ -->
            <p-tabpanel value="5">
              <div class="pt-4 space-y-6">
                @if (settingsLoading()) {
                  <div class="text-center py-8 text-gray-500"><i class="pi pi-spinner pi-spin"></i> Loading settings...</div>
                } @else {
                  <div class="bg-white rounded-xl p-6 border border-gray-200">
                    <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Workflow & Automation</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
                      @for (toggle of [
                        {key:'auto_reply_enabled', label:'Auto-reply', desc:'Automatically reply to incoming messages'},
                        {key:'order_notifications_enabled', label:'Order Notifications', desc:'WhatsApp notifications for orders'},
                        {key:'commerce_catalog_enabled', label:'Commerce Catalog', desc:'Meta Commerce catalog integration'},
                        {key:'ai_enabled', label:'AI Features', desc:'AI-powered responses and suggestions'}
                      ]; track toggle.key) {
                        <div class="flex items-center justify-between py-3 border-b border-gray-200">
                          <div><p class="text-sm text-gray-900">{{ toggle.label }}</p><p class="text-[10px] text-gray-500">{{ toggle.desc }}</p></div>
                          <p-toggleswitch [(ngModel)]="settingsForm[toggle.key]" />
                        </div>
                      }
                    </div>
                  </div>
                  <div class="bg-white rounded-xl p-6 border border-gray-200">
                    <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Messages & Locale</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div class="flex flex-col gap-1">
                        <label class="text-xs text-gray-500">Welcome Message</label>
                        <textarea pTextarea [(ngModel)]="settingsForm.welcome_message" rows="2" class="w-full" placeholder="Hello! Welcome..."></textarea>
                      </div>
                      <div class="flex flex-col gap-1">
                        <label class="text-xs text-gray-500">Away Message</label>
                        <textarea pTextarea [(ngModel)]="settingsForm.away_message" rows="2" class="w-full" placeholder="We're currently away..."></textarea>
                      </div>
                      <div class="flex flex-col gap-1">
                        <label class="text-xs text-gray-500">Language</label>
                        <p-select [(ngModel)]="settingsForm.default_language" [options]="languageOptions" optionLabel="label" optionValue="value" styleClass="w-full" />
                      </div>
                      <div class="flex flex-col gap-1">
                        <label class="text-xs text-gray-500">Timezone</label>
                        <p-select [(ngModel)]="settingsForm.timezone" [options]="timezoneOptions" optionLabel="label" optionValue="value" styleClass="w-full" />
                      </div>
                    </div>
                  </div>
                  <!-- Raw settings -->
                  @if (settingsEntries().length) {
                    <div class="bg-white rounded-xl p-6 border border-gray-200">
                      <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">All Settings (Raw)</h3>
                      <div class="space-y-1 max-h-48 overflow-y-auto">
                        @for (entry of settingsEntries(); track entry.key) {
                          <div class="flex gap-3 py-1.5 border-b border-gray-200 last:border-0 text-xs">
                            <span class="text-gray-500 font-mono min-w-40 shrink-0">{{ entry.key }}</span>
                            <span class="text-gray-900 truncate">{{ entry.value }}</span>
                          </div>
                        }
                      </div>
                    </div>
                  }
                  <div class="flex justify-end">
                    <button pButton label="Save Settings" icon="pi pi-check" severity="success" [loading]="saving()" (click)="saveSettings()"></button>
                  </div>
                }
              </div>
            </p-tabpanel>

          </p-tabpanels>
        </p-tabs>
      }

      <!-- ════════ Custom Plan Dialog ════════ -->
      <p-dialog [(visible)]="showCustomPlanDialog" header="Create Custom Plan for This Tenant" [modal]="true" [style]="{width:'600px'}" [draggable]="false">
        <div class="space-y-4 py-2">
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm text-gray-700">Plan Name</label>
              <input pInputText [(ngModel)]="customPlan.name" placeholder="e.g. Custom Pro" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm text-gray-700">Monthly Price (cents)</label>
              <p-inputnumber [(ngModel)]="customPlan.monthlyPrice" [min]="0" placeholder="0" styleClass="w-full" inputStyleClass="w-full" />
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm text-gray-700">Description</label>
            <input pInputText [(ngModel)]="customPlan.description" placeholder="Custom plan for this tenant" class="w-full" />
          </div>
          <p-divider />
          <h4 class="text-sm font-semibold text-gray-700">Usage Limits <span class="text-xs text-gray-500 font-normal">(blank = unlimited)</span></h4>
          <div class="grid grid-cols-3 gap-3">
            <div class="flex flex-col gap-1">
              <label class="text-xs text-gray-500">Conversations/mo</label>
              <p-inputnumber [(ngModel)]="customPlan.limits['conversationLimit']" [min]="0" placeholder="Unlimited" styleClass="w-full" inputStyleClass="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs text-gray-500">Products</label>
              <p-inputnumber [(ngModel)]="customPlan.limits['productLimit']" [min]="0" placeholder="Unlimited" styleClass="w-full" inputStyleClass="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs text-gray-500">Team Members</label>
              <p-inputnumber [(ngModel)]="customPlan.limits['userLimit']" [min]="0" placeholder="Unlimited" styleClass="w-full" inputStyleClass="w-full" />
            </div>
          </div>
          <p-divider />
          <h4 class="text-sm font-semibold text-gray-700">Features</h4>
          <div class="grid grid-cols-2 gap-x-6 gap-y-1">
            @for (feat of featureList; track feat.key) {
              <div class="flex items-center justify-between py-2">
                <span class="text-sm text-gray-700">{{ feat.label }}</span>
                <p-toggleswitch [(ngModel)]="customPlan.features[feat.key]" />
              </div>
            }
          </div>
        </div>
        <ng-template pTemplate="footer">
          <button pButton label="Cancel" class="p-button-text text-gray-500" (click)="showCustomPlanDialog = false"></button>
          <button pButton label="Create & Assign" icon="pi pi-check" severity="success" [loading]="creatingCustomPlan()" [disabled]="!customPlan.name.trim()" (click)="createCustomPlan()"></button>
        </ng-template>
      </p-dialog>

      <!-- ════════ Workflow Editor Dialog ════════ -->
      <p-dialog [(visible)]="showWorkflowEditor" [header]="'Edit Workflow: ' + (editingWf?.name || '')" [modal]="true" [style]="{width:'90vw', height:'80vh'}" [draggable]="false" [maximizable]="true">
        @if (editingWf) {
          <div class="space-y-4">
            <div class="grid grid-cols-3 gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-xs text-gray-500">Name</label>
                <input pInputText [(ngModel)]="editingWf.name" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs text-gray-500">Description</label>
                <input pInputText [(ngModel)]="editingWf.description" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs text-gray-500">Status</label>
                <p-select [(ngModel)]="editingWf.status" [options]="workflowStatusOptions" optionLabel="label" optionValue="value" styleClass="w-full" />
              </div>
            </div>
            <p-divider />
            <div class="bg-gray-100 rounded-lg p-4">
              <h4 class="text-sm font-semibold text-gray-600 mb-2">Workflow Definition ({{ editingWf.nodes?.length || 0 }} nodes, {{ editingWf.edges?.length || 0 }} edges)</h4>
              <div class="flex flex-wrap gap-2 mb-3">
                @for (node of editingWf.nodes || []; track node.id) {
                  <div class="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs">
                    <span class="font-semibold text-gray-900">{{ node.label || node.type }}</span>
                    <span class="text-gray-500 ml-1">({{ node.type }})</span>
                  </div>
                }
              </div>
              <p class="text-xs text-gray-500">
                <i class="pi pi-info-circle mr-1"></i>
                To edit the visual workflow, use the Workflow Builder in the tenant's admin panel.
              </p>
            </div>
          </div>
        }
        <ng-template pTemplate="footer">
          <button pButton label="Cancel" class="p-button-text" (click)="showWorkflowEditor = false"></button>
          <button pButton label="Save Changes" icon="pi pi-check" severity="success" [loading]="savingWorkflow()" (click)="saveWorkflow()"></button>
        </ng-template>
      </p-dialog>
    </div>
  `,
})
export class TenantDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly tenantService = inject(TenantService);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly api = inject(ApiService);
  private readonly messageService = inject(MessageService);

  tenantId = '';
  loading = signal(true);
  settingsLoading = signal(true);
  saving = signal(false);
  assigningPlan = signal(false);
  savingFeatures = signal(false);
  creatingCustomPlan = signal(false);
  workflowsLoading = signal(true);
  savingWorkflow = signal(false);

  tenant = signal<any>(null);
  activeSub = signal<any>(null);
  rawSettings = signal<Record<string, any>>({});
  settingsEntries = signal<{ key: string; value: string }[]>([]);
  allPlans = signal<any[]>([]);
  workflows = signal<any[]>([]);

  // Plan assignment
  selectedPlanId = '';
  planExpiry: Date | null = null;
  minDate = new Date();
  planOptions = computed(() =>
    this.allPlans().map((p: any) => ({
      label: `${p.name} (${p.tier})${!p.isActive ? ' — hidden' : ''}`,
      value: p.id,
    })),
  );

  // Feature overrides
  featureList = Object.entries(FEATURE_LABELS).map(([key, val]) => ({ key, ...val }));
  featureOverrides: Record<string, boolean> = {};
  planFeatures = signal<Record<string, boolean>>({});

  // Custom plan dialog
  showCustomPlanDialog = false;
  customPlan = this.getEmptyCustomPlan();

  // Workflow editor
  showWorkflowEditor = false;
  editingWf: any = null;
  workflowStatusOptions = [
    { label: 'Draft', value: 'draft' },
    { label: 'Active', value: 'active' },
    { label: 'Paused', value: 'paused' },
    { label: 'Preview', value: 'preview' },
    { label: 'Archived', value: 'archived' },
  ];

  settingsForm = {
    auto_reply_enabled: false,
    order_notifications_enabled: true,
    commerce_catalog_enabled: false,
    ai_enabled: false,
    welcome_message: '',
    away_message: '',
    default_language: 'en',
    timezone: 'Asia/Kolkata',
  } as { [key: string]: any; auto_reply_enabled: boolean; order_notifications_enabled: boolean; commerce_catalog_enabled: boolean; ai_enabled: boolean; welcome_message: string; away_message: string; default_language: string; timezone: string };

  languageOptions = [
    { label: 'English', value: 'en' }, { label: 'Hindi', value: 'hi' },
    { label: 'Spanish', value: 'es' }, { label: 'Portuguese', value: 'pt' }, { label: 'French', value: 'fr' },
  ];
  timezoneOptions = [
    { label: 'Asia/Kolkata (IST)', value: 'Asia/Kolkata' }, { label: 'UTC', value: 'UTC' },
    { label: 'America/New_York (EST)', value: 'America/New_York' }, { label: 'Europe/London (GMT)', value: 'Europe/London' },
  ];

  ngOnInit() {
    this.tenantId = this.route.snapshot.paramMap.get('id') || '';
    this.loadTenant();
    this.loadSubscription();
    this.loadSettings();
    this.loadPlans();
    this.loadWorkflows();
  }

  // ─── Data loading ─────────────────────────────────────────────────────

  loadTenant() {
    this.loading.set(true);
    this.tenantService.getById(this.tenantId).subscribe({
      next: (t) => { this.tenant.set(t); this.loading.set(false); },
      error: () => { this.loading.set(false); this.toast('error', 'Failed to load tenant'); },
    });
  }

  loadSubscription() {
    this.subscriptionService.getTenantSubscription(this.tenantId).subscribe({
      next: (sub: any) => {
        if (sub && !sub.message) {
          this.activeSub.set(sub);
          const pf = sub.planFeatures || {};
          this.planFeatures.set({ ...pf });
          this.featureOverrides = { ...pf };
        }
      },
      error: () => {},
    });
  }

  loadPlans() {
    this.subscriptionService.getPlans().subscribe({
      next: (plans: any[]) => this.allPlans.set(plans),
      error: () => {},
    });
  }

  loadWorkflows() {
    this.workflowsLoading.set(true);
    this.api.get<any[]>(`/admin/tenants/${this.tenantId}/workflows`).subscribe({
      next: (wfs) => { this.workflows.set(wfs || []); this.workflowsLoading.set(false); },
      error: () => { this.workflowsLoading.set(false); },
    });
  }

  loadSettings() {
    this.settingsLoading.set(true);
    this.api.get<Record<string, any>>(`/admin/tenants/${this.tenantId}/settings`).subscribe({
      next: (settings) => {
        this.rawSettings.set(settings || {});
        for (const key of Object.keys(this.settingsForm)) {
          if (settings[key] !== undefined) this.settingsForm[key] = settings[key];
        }
        this.settingsEntries.set(
          Object.entries(settings || {}).map(([key, value]) => ({
            key, value: typeof value === 'object' ? JSON.stringify(value) : String(value),
          })),
        );
        this.settingsLoading.set(false);
      },
      error: () => this.settingsLoading.set(false),
    });
  }

  // ─── Plan management ──────────────────────────────────────────────────

  assignPlan() {
    if (!this.selectedPlanId) return;
    this.assigningPlan.set(true);
    const payload: any = { planId: this.selectedPlanId };
    if (this.planExpiry) payload.validUntil = this.planExpiry.toISOString();
    this.subscriptionService.assignTenantPlan(this.tenantId, payload).subscribe({
      next: () => {
        this.assigningPlan.set(false);
        this.toast('success', 'Plan assigned successfully');
        this.selectedPlanId = '';
        this.planExpiry = null;
        this.loadTenant();
        this.loadSubscription();
      },
      error: () => { this.assigningPlan.set(false); this.toast('error', 'Failed to assign plan'); },
    });
  }

  getEmptyCustomPlan() {
    return {
      name: '',
      description: '',
      monthlyPrice: 0,
      limits: { conversationLimit: null, productLimit: null, userLimit: null } as Record<string, any>,
      features: Object.fromEntries(Object.keys(FEATURE_LABELS).map(k => [k, true])),
    };
  }

  createCustomPlan() {
    if (!this.customPlan.name.trim()) return;
    this.creatingCustomPlan.set(true);

    const payload: any = {
      name: this.customPlan.name,
      tier: 'custom',
      description: this.customPlan.description || `Custom plan for ${this.tenant()?.name}`,
      monthlyPrice: this.customPlan.monthlyPrice || 0,
      yearlyPrice: (this.customPlan.monthlyPrice || 0) * 10,
      pricePerConversation: 0,
      limits: this.customPlan.limits,
      features: this.customPlan.features,
      isActive: false, // Don't show in public listing
      sortOrder: 99,
    };

    this.subscriptionService.createPlan(payload).subscribe({
      next: (plan: any) => {
        // Now assign it to this tenant
        const assignPayload: any = { planId: plan.id };
        if (this.planExpiry) assignPayload.validUntil = this.planExpiry.toISOString();
        this.subscriptionService.assignTenantPlan(this.tenantId, assignPayload).subscribe({
          next: () => {
            this.creatingCustomPlan.set(false);
            this.showCustomPlanDialog = false;
            this.customPlan = this.getEmptyCustomPlan();
            this.toast('success', 'Custom plan created and assigned');
            this.loadTenant();
            this.loadSubscription();
            this.loadPlans();
          },
          error: () => { this.creatingCustomPlan.set(false); this.toast('error', 'Plan created but failed to assign'); },
        });
      },
      error: () => { this.creatingCustomPlan.set(false); this.toast('error', 'Failed to create custom plan'); },
    });
  }

  // ─── Features ─────────────────────────────────────────────────────────

  saveFeatures() {
    this.savingFeatures.set(true);
    this.subscriptionService.updateTenantFeatures(this.tenantId, this.featureOverrides).subscribe({
      next: () => { this.savingFeatures.set(false); this.toast('success', 'Features updated'); this.loadSubscription(); },
      error: () => { this.savingFeatures.set(false); this.toast('error', 'Failed to update features'); },
    });
  }

  resetFeaturesToPlan() {
    this.featureOverrides = { ...this.planFeatures() };
    this.toast('info', 'Reset to plan defaults');
  }

  // ─── Workflows ────────────────────────────────────────────────────────

  openWorkflowEditor(wf: any) {
    // Load full workflow with nodes/edges if not loaded
    if (!wf.nodes || !wf.nodes.length) {
      this.api.get<any>(`/admin/tenants/${this.tenantId}/workflows/${wf.id}`).subscribe({
        next: (full) => {
          this.editingWf = { ...full };
          this.showWorkflowEditor = true;
        },
        error: () => this.toast('error', 'Failed to load workflow'),
      });
    } else {
      this.editingWf = { ...wf };
      this.showWorkflowEditor = true;
    }
  }

  saveWorkflow() {
    if (!this.editingWf) return;
    this.savingWorkflow.set(true);
    this.api.put(`/admin/tenants/${this.tenantId}/workflows/${this.editingWf.id}`, {
      name: this.editingWf.name,
      description: this.editingWf.description,
      status: this.editingWf.status,
      nodes: this.editingWf.nodes,
      edges: this.editingWf.edges,
    }).subscribe({
      next: () => {
        this.savingWorkflow.set(false);
        this.showWorkflowEditor = false;
        this.toast('success', 'Workflow saved');
        this.loadWorkflows();
      },
      error: () => { this.savingWorkflow.set(false); this.toast('error', 'Failed to save workflow'); },
    });
  }

  toggleWorkflowStatus(wf: any) {
    const newStatus = wf.status === 'active' ? 'paused' : 'active';
    this.api.put(`/admin/tenants/${this.tenantId}/workflows/${wf.id}`, { status: newStatus }).subscribe({
      next: () => {
        wf.status = newStatus;
        this.workflows.update(list => [...list]);
        this.toast('info', `Workflow ${newStatus === 'active' ? 'activated' : 'paused'}`);
      },
      error: () => this.toast('error', 'Failed to update workflow'),
    });
  }

  // ─── Settings ─────────────────────────────────────────────────────────

  saveSettings() {
    this.saving.set(true);
    this.api.put(`/admin/tenants/${this.tenantId}/settings`, this.settingsForm).subscribe({
      next: () => { this.saving.set(false); this.toast('success', 'Settings saved'); this.loadSettings(); },
      error: () => { this.saving.set(false); this.toast('error', 'Failed to save settings'); },
    });
  }

  // ─── Tenant actions ───────────────────────────────────────────────────

  suspendTenant() {
    this.tenantService.suspend(this.tenantId).subscribe({
      next: () => { this.toast('warn', 'Tenant suspended'); this.loadTenant(); },
      error: () => this.toast('error', 'Failed to suspend'),
    });
  }

  activateTenant() {
    this.tenantService.activate(this.tenantId).subscribe({
      next: () => { this.toast('success', 'Tenant activated'); this.loadTenant(); },
      error: () => this.toast('error', 'Failed to activate'),
    });
  }

  getStatusSeverity(status: string): any {
    return { active: 'success', trialing: 'info', suspended: 'danger', pending: 'warn', deactivated: 'secondary' }[status] ?? 'secondary';
  }

  private toast(severity: string, summary: string) {
    this.messageService.add({ severity, summary, life: 3000 });
  }
}
