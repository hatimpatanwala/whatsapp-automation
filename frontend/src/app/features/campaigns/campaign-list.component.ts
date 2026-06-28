import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ToastModule } from 'primeng/toast';
import { ProgressBarModule } from 'primeng/progressbar';
import { MessageService } from 'primeng/api';
import { FormsModule } from '@angular/forms';
import { CampaignService } from '../../core/services/campaign.service';
import { Campaign, CampaignStats } from '../../core/models';

interface CampaignRow {
  id: string;
  name: string;
  type: string;
  status: string;
  totalRecipients: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  deliveryRate: number;
  readRate: number;
  scheduledAt: string;
  createdAt: string;
}

@Component({
  selector: 'wa-campaign-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TableModule,
    ButtonModule,
    TagModule,
    SelectModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    ToastModule,
    ProgressBarModule,
    FormsModule,
  ],
  providers: [MessageService],
  template: `
    <div class="p-6 space-y-5">
      <p-toast />

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p class="text-gray-500 text-sm">Manage and track WhatsApp marketing campaigns</p>
        </div>
        <button pButton label="New Campaign" icon="pi pi-plus" severity="success" routerLink="new"></button>
      </div>

      <!-- Summary stats -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        @for (stat of summaryStats(); track stat.label) {
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3.5 hover:shadow-md transition-shadow">
            <div [class]="'flex items-center justify-center w-11 h-11 rounded-xl shrink-0 ' + stat.iconBg">
              <i [class]="'pi ' + stat.icon" style="font-size:1.1rem"></i>
            </div>
            <div class="min-w-0">
              <p class="text-2xl font-bold text-gray-900 tabular-nums leading-none">{{ stat.value }}</p>
              <p class="text-xs text-gray-500 mt-1 truncate">{{ stat.label }}</p>
            </div>
          </div>
        }
      </div>

      <!-- Filters -->
      <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex gap-3 flex-wrap">
        <p-iconfield class="flex-1 min-w-48">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText [(ngModel)]="searchQuery" placeholder="Search campaigns..." class="w-full" (input)="filter()" />
        </p-iconfield>
        <p-select [(ngModel)]="statusFilter" [options]="statusOptions" optionLabel="label" optionValue="value"
          placeholder="All statuses" styleClass="min-w-36" (onChange)="filter()" />
        <p-select [(ngModel)]="typeFilter" [options]="typeOptions" optionLabel="label" optionValue="value"
          placeholder="All types" styleClass="min-w-36" (onChange)="filter()" />
      </div>

      <!-- Campaign cards / table -->
      <div class="space-y-3">
        @if (loadingCampaigns()) {
          <div class="flex items-center justify-center py-12">
            <i class="pi pi-spin pi-spinner text-primary-500" style="font-size:1.5rem"></i>
          </div>
        }
        @for (campaign of filteredCampaigns(); track campaign.id) {
          <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:border-primary-200 transition-colors">
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1">
                <div class="flex items-center gap-3 mb-2">
                  <h3 class="text-base font-semibold text-gray-900">{{ campaign.name }}</h3>
                  <p-tag [value]="campaign.status" [severity]="getStatusSeverity(campaign.status)" styleClass="text-xs capitalize" />
                  <p-tag [value]="campaign.type" severity="secondary" styleClass="text-xs capitalize" />
                </div>
                <p class="text-xs text-gray-400 mb-4">
                  {{ campaign.status === 'scheduled' ? 'Scheduled: ' + campaign.scheduledAt : 'Created: ' + campaign.createdAt }}
                  · {{ campaign.totalRecipients | number }} recipients
                </p>

                <!-- Stats row -->
                @if (campaign.status === 'completed' || campaign.status === 'running') {
                  <div class="grid grid-cols-4 gap-4">
                    <div>
                      <p class="text-xs text-gray-400">Sent</p>
                      <p class="font-semibold text-gray-900">{{ campaign.sent | number }}</p>
                    </div>
                    <div>
                      <p class="text-xs text-gray-400">Delivered</p>
                      <div class="flex items-center gap-2">
                        <p class="font-semibold text-gray-900">{{ campaign.deliveryRate }}%</p>
                        <p-progressBar [value]="campaign.deliveryRate" styleClass="flex-1" [style]="{'height': '4px'}" [showValue]="false" />
                      </div>
                    </div>
                    <div>
                      <p class="text-xs text-gray-400">Read Rate</p>
                      <div class="flex items-center gap-2">
                        <p class="font-semibold text-blue-600">{{ campaign.readRate }}%</p>
                        <p-progressBar [value]="campaign.readRate" styleClass="flex-1" color="#34B7F1" [style]="{'height': '4px'}" [showValue]="false" />
                      </div>
                    </div>
                    <div>
                      <p class="text-xs text-gray-400">Replies</p>
                      <p class="font-semibold text-primary-600">{{ campaign.replied | number }}</p>
                    </div>
                  </div>
                }
              </div>
              <div class="flex gap-2 flex-shrink-0">
                @if (campaign.status === 'draft') {
                  <button pButton icon="pi pi-send" label="Launch" class="p-button-sm" severity="success"
                    [loading]="launchingId() === campaign.id"
                    (click)="launchCampaign(campaign)"></button>
                }
                @if (campaign.status === 'running') {
                  <button pButton icon="pi pi-pause" label="Pause" class="p-button-sm p-button-outlined" severity="warn"
                    [loading]="pausingId() === campaign.id"
                    (click)="pauseCampaign(campaign)"></button>
                }
                <button pButton icon="pi pi-pencil" class="p-button-text p-button-sm p-button-rounded" pTooltip="Edit" [routerLink]="[campaign.id, 'edit']"></button>
                <button pButton icon="pi pi-copy" class="p-button-text p-button-sm p-button-rounded" pTooltip="Duplicate"
                  (click)="duplicateCampaign(campaign)"></button>
              </div>
            </div>
          </div>
        }

        @if (!loadingCampaigns() && filteredCampaigns().length === 0) {
          <div class="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
            <i class="pi pi-megaphone text-gray-300" style="font-size:3rem"></i>
            <p class="text-base font-medium text-gray-600 mt-4">No campaigns found</p>
            <p class="text-sm text-gray-400">Create your first campaign to reach your customers</p>
            <button pButton label="Create Campaign" icon="pi pi-plus" severity="success" class="mt-4" routerLink="new"></button>
          </div>
        }
      </div>
    </div>
  `,
})
export class CampaignListComponent implements OnInit {
  private readonly messageService = inject(MessageService);
  private readonly campaignService = inject(CampaignService);

  loadingCampaigns = signal(true);
  searchQuery = '';
  statusFilter = '';
  typeFilter = '';
  filteredCampaigns = signal<CampaignRow[]>([]);
  launchingId = signal<string | null>(null);
  pausingId = signal<string | null>(null);

  summaryStats = signal([
    { label: 'Total Campaigns', value: '0', icon: 'pi-megaphone', iconBg: 'bg-slate-100 text-slate-600' },
    { label: 'Running', value: '0', icon: 'pi-send', iconBg: 'bg-primary-50 text-primary-600' },
    { label: 'Avg Delivery Rate', value: 'N/A', icon: 'pi-check-circle', iconBg: 'bg-green-50 text-green-600' },
    { label: 'Avg Read Rate', value: 'N/A', icon: 'pi-eye', iconBg: 'bg-blue-50 text-blue-600' },
  ]);

  statusOptions = [
    { label: 'All Statuses', value: '' },
    { label: 'Draft', value: 'draft' },
    { label: 'Scheduled', value: 'scheduled' },
    { label: 'Running', value: 'running' },
    { label: 'Completed', value: 'completed' },
    { label: 'Paused', value: 'paused' },
    { label: 'Canceled', value: 'canceled' },
  ];

  typeOptions = [
    { label: 'All Types', value: '' },
    { label: 'Broadcast', value: 'broadcast' },
    { label: 'Drip', value: 'drip' },
    { label: 'Triggered', value: 'triggered' },
  ];

  private allCampaigns: CampaignRow[] = [];

  ngOnInit() {
    this.loadCampaigns();
  }

  private loadCampaigns() {
    this.loadingCampaigns.set(true);

    this.campaignService.getAll().subscribe({
      next: (res) => {
        this.allCampaigns = res.data.map(c => this.mapCampaign(c));
        this.computeSummaryStats();
        this.filter();
        this.loadingCampaigns.set(false);
      },
      error: () => {
        this.loadingCampaigns.set(false);
      },
    });
  }

  private mapCampaign(c: Campaign): CampaignRow {
    const stats = c.stats;
    const totalRecipients = stats?.totalRecipients ?? 0;
    const sent = stats?.sent ?? 0;
    const delivered = stats?.delivered ?? 0;
    const read = stats?.read ?? 0;
    const replied = stats?.replied ?? 0;
    const deliveryRate = stats?.deliveryRate ?? (sent > 0 ? Math.round((delivered / sent) * 100) : 0);
    const readRate = stats?.readRate ?? (delivered > 0 ? Math.round((read / delivered) * 100) : 0);

    return {
      id: c.id,
      name: c.name,
      type: c.type ?? 'broadcast',
      status: c.status,
      totalRecipients,
      sent,
      delivered,
      read,
      replied,
      deliveryRate,
      readRate,
      scheduledAt: c.scheduledAt ? this.formatDate(c.scheduledAt) : '',
      createdAt: this.formatDate(c.createdAt),
    };
  }

  private formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private computeSummaryStats() {
    const total = this.allCampaigns.length;
    const running = this.allCampaigns.filter(c => c.status === 'running').length;

    const withDelivery = this.allCampaigns.filter(c => c.deliveryRate > 0);
    const avgDelivery = withDelivery.length > 0
      ? Math.round(withDelivery.reduce((sum, c) => sum + c.deliveryRate, 0) / withDelivery.length)
      : 0;

    const withRead = this.allCampaigns.filter(c => c.readRate > 0);
    const avgRead = withRead.length > 0
      ? Math.round(withRead.reduce((sum, c) => sum + c.readRate, 0) / withRead.length)
      : 0;

    this.summaryStats.set([
      { label: 'Total Campaigns', value: String(total), icon: 'pi-megaphone', iconBg: 'bg-slate-100 text-slate-600' },
      { label: 'Running', value: String(running), icon: 'pi-send', iconBg: 'bg-primary-50 text-primary-600' },
      { label: 'Avg Delivery Rate', value: withDelivery.length > 0 ? `${avgDelivery}%` : 'N/A', icon: 'pi-check-circle', iconBg: 'bg-green-50 text-green-600' },
      { label: 'Avg Read Rate', value: withRead.length > 0 ? `${avgRead}%` : 'N/A', icon: 'pi-eye', iconBg: 'bg-blue-50 text-blue-600' },
    ]);
  }

  filter() {
    let result = [...this.allCampaigns];
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(q));
    }
    if (this.statusFilter) result = result.filter(c => c.status === this.statusFilter);
    if (this.typeFilter) result = result.filter(c => c.type === this.typeFilter);
    this.filteredCampaigns.set(result);
  }

  launchCampaign(campaign: CampaignRow) {
    this.launchingId.set(campaign.id);
    this.campaignService.send(campaign.id).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Campaign Launched', detail: `"${campaign.name}" is now sending.` });
        this.launchingId.set(null);
        this.loadCampaigns();
      },
      error: (err) => {
        this.messageService.add({ severity: 'error', summary: 'Launch Failed', detail: err?.error?.message ?? 'Could not launch campaign.' });
        this.launchingId.set(null);
      },
    });
  }

  pauseCampaign(campaign: CampaignRow) {
    this.pausingId.set(campaign.id);
    this.campaignService.pause(campaign.id).subscribe({
      next: () => {
        this.messageService.add({ severity: 'warn', summary: 'Campaign Paused', detail: `"${campaign.name}" has been paused.` });
        this.pausingId.set(null);
        this.loadCampaigns();
      },
      error: (err) => {
        this.messageService.add({ severity: 'error', summary: 'Pause Failed', detail: err?.error?.message ?? 'Could not pause campaign.' });
        this.pausingId.set(null);
      },
    });
  }

  duplicateCampaign(campaign: CampaignRow) {
    this.campaignService.duplicate(campaign.id).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Duplicated', detail: `A copy of "${campaign.name}" has been created as a draft.` });
        this.loadCampaigns();
      },
      error: (err) => {
        this.messageService.add({ severity: 'error', summary: 'Duplicate Failed', detail: err?.error?.message ?? 'Could not duplicate campaign.' });
      },
    });
  }

  getStatusSeverity(status: string): any {
    const map: Record<string, any> = {
      draft: 'secondary', scheduled: 'info', running: 'success',
      completed: 'success', paused: 'warn', canceled: 'danger', failed: 'danger',
    };
    return map[status] ?? 'secondary';
  }
}
