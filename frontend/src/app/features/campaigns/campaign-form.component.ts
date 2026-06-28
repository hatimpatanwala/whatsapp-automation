import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { MultiSelectModule } from 'primeng/multiselect';
import { DatePickerModule } from 'primeng/datepicker';
import { ToastModule } from 'primeng/toast';
import { StepperModule } from 'primeng/stepper';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageService } from 'primeng/api';
import { FormsModule } from '@angular/forms';
import { DividerModule } from 'primeng/divider';
import { CampaignService } from '../../core/services/campaign.service';
import { ApiService } from '../../core/services/api.service';

interface Segment {
  id: string;
  name: string;
  customerCount: number;
}

@Component({
  selector: 'wa-campaign-form',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    FormsModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    ButtonModule,
    MultiSelectModule,
    DatePickerModule,
    ToastModule,
    StepperModule,
    CheckboxModule,
    InputNumberModule,
    DividerModule,
  ],
  providers: [MessageService],
  template: `
    <div class="p-6 max-w-4xl mx-auto">
      <p-toast />

      <!-- Header -->
      <div class="flex items-center gap-4 mb-6">
        <button pButton icon="pi pi-arrow-left" class="p-button-text p-button-rounded" routerLink="/campaigns"></button>
        <div>
          <h1 class="text-2xl font-bold text-gray-900">{{ isEdit() ? 'Edit Campaign' : 'New Campaign' }}</h1>
          <p class="text-gray-500 text-sm">Build and launch your WhatsApp marketing campaign</p>
        </div>
      </div>

      <!-- Stepper -->
      <p-stepper [value]="activeStep()" (valueChange)="activeStep.set($event ?? 1)" styleClass="mb-6">
        <p-step-list>
          <p-step [value]="1">Campaign Setup</p-step>
          <p-step [value]="2">Audience</p-step>
          <p-step [value]="3">Message</p-step>
          <p-step [value]="4">Schedule</p-step>
        </p-step-list>

        <p-step-panels>
          <!-- Step 1: Setup -->
          <p-step-panel [value]="1">
            <ng-template #content>
            <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4 mt-4">
              <h3 class="text-base font-semibold text-gray-900">Campaign Details</h3>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Campaign Name *</label>
                <input pInputText [(ngModel)]="campaignName" placeholder="e.g. May Day Flash Sale" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Description</label>
                <textarea pTextarea [(ngModel)]="campaignDesc" rows="2" class="w-full" placeholder="Brief description of this campaign..."></textarea>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Campaign Type</label>
                  <p-select [(ngModel)]="campaignType" [options]="typeOptions" optionLabel="label" optionValue="value" styleClass="w-full" />
                </div>
              </div>
            </div>
            <div class="flex justify-end mt-4">
              <button pButton label="Next: Audience" icon="pi pi-arrow-right" iconPos="right" severity="success" (click)="activeStep.set(2)"></button>
            </div>
            </ng-template>
          </p-step-panel>

          <!-- Step 2: Audience -->
          <p-step-panel [value]="2">
            <ng-template #content>
            <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-5 mt-4">
              <h3 class="text-base font-semibold text-gray-900">Target Audience</h3>

              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Select Segments</label>
                <p-multiselect
                  [(ngModel)]="selectedSegments"
                  [options]="segments"
                  optionLabel="name"
                  optionValue="id"
                  placeholder="Select audience segments"
                  styleClass="w-full"
                  display="chip"
                  (onChange)="calcTotalReach()"
                >
                  <ng-template pTemplate="item" let-segment>
                    <div class="flex items-center justify-between w-full">
                      <span>{{ segment.name }}</span>
                      <span class="text-xs text-gray-400 ml-4">{{ segment.customerCount | number }} customers</span>
                    </div>
                  </ng-template>
                </p-multiselect>
              </div>

              @if (totalReach() > 0) {
                <div class="bg-primary-50 rounded-lg p-4 border border-primary-100">
                  <div class="flex items-center gap-3">
                    <i class="pi pi-users text-primary-600" style="font-size:1.5rem"></i>
                    <div>
                      <p class="text-sm text-gray-600">Estimated Reach</p>
                      <p class="text-2xl font-bold text-primary-700">{{ totalReach() | number }}</p>
                      <p class="text-xs text-gray-500">unique customers across selected segments</p>
                    </div>
                  </div>
                </div>
              }

              <!-- Segment builder preview -->
              <div class="border border-dashed border-gray-200 rounded-lg p-4">
                <div class="flex items-center justify-between mb-3">
                  <h4 class="text-sm font-semibold text-gray-700">Build Custom Segment</h4>
                  <button pButton label="Add Rule" icon="pi pi-plus" class="p-button-text p-button-sm" (click)="addSegmentRule()"></button>
                </div>
                @if (segmentRules().length === 0) {
                  <p class="text-xs text-gray-400 text-center py-4">Add rules to create a custom segment filter</p>
                } @else {
                  <div class="space-y-2">
                    @for (rule of segmentRules(); track rule.id) {
                      <div class="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
                        <p-select [(ngModel)]="rule.field" [options]="ruleFields" optionLabel="label" optionValue="value" styleClass="min-w-40" />
                        <p-select [(ngModel)]="rule.operator" [options]="ruleOperators" optionLabel="label" optionValue="value" styleClass="min-w-32" />
                        <input pInputText [(ngModel)]="rule.value" placeholder="Value" class="flex-1" />
                        <button pButton icon="pi pi-trash" class="p-button-text p-button-sm p-button-rounded p-button-danger" (click)="removeRule(rule.id)"></button>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
            <div class="flex justify-between mt-4">
              <button pButton label="Back" icon="pi pi-arrow-left" class="p-button-outlined" (click)="activeStep.set(1)"></button>
              <button pButton label="Next: Message" icon="pi pi-arrow-right" iconPos="right" severity="success" (click)="activeStep.set(3)"></button>
            </div>
            </ng-template>
          </p-step-panel>

          <!-- Step 3: Message -->
          <p-step-panel [value]="3">
            <ng-template #content>
            <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-5 mt-4">
              <h3 class="text-base font-semibold text-gray-900">Campaign Message</h3>

              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Message Type</label>
                <p-select [(ngModel)]="messageType" [options]="messageTypeOptions" optionLabel="label" optionValue="value" styleClass="w-full" />
              </div>

              @if (messageType === 'template') {
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">WhatsApp Template</label>
                  <p-select [(ngModel)]="selectedTemplate" [options]="templates" optionLabel="name" optionValue="id" styleClass="w-full" placeholder="Select an approved template" />
                </div>
              } @else {
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Message Text</label>
                  <textarea pTextarea [(ngModel)]="messageText" rows="5" class="w-full"
                    [placeholder]="'Write your message here. Use ' + '{{name}}, {{orderId}}' + ' for personalization...'"></textarea>
                  <p class="text-xs text-gray-400">{{ messageText.length }}/1024 characters</p>
                </div>
              }

              <!-- Preview -->
              <div class="rounded-xl overflow-hidden border border-gray-200">
                <div class="bg-gray-200 px-4 py-2 flex items-center gap-2">
                  <div class="w-3 h-3 rounded-full bg-red-400"></div>
                  <div class="w-3 h-3 rounded-full bg-yellow-400"></div>
                  <div class="w-3 h-3 rounded-full bg-green-400"></div>
                  <span class="text-xs text-gray-500 ml-2">WhatsApp Preview</span>
                </div>
                <div class="bg-amber-50 p-4 min-h-24">
                  <div class="max-w-xs bg-white rounded-xl rounded-tl-sm px-4 py-3 shadow-sm">
                    <p class="text-sm text-gray-800 whitespace-pre-wrap">{{ messageText || 'Your message preview will appear here...' }}</p>
                    <p class="text-right text-xs text-gray-400 mt-1">10:24 AM ✓✓</p>
                  </div>
                </div>
              </div>
            </div>
            <div class="flex justify-between mt-4">
              <button pButton label="Back" icon="pi pi-arrow-left" class="p-button-outlined" (click)="activeStep.set(2)"></button>
              <button pButton label="Next: Schedule" icon="pi pi-arrow-right" iconPos="right" severity="success" (click)="activeStep.set(4)"></button>
            </div>
            </ng-template>
          </p-step-panel>

          <!-- Step 4: Schedule -->
          <p-step-panel [value]="4">
            <ng-template #content>
            <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-5 mt-4">
              <h3 class="text-base font-semibold text-gray-900">Schedule Campaign</h3>

              <div class="space-y-3">
                @for (opt of scheduleOptions; track opt.value) {
                  <div
                    class="flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-colors"
                    [class.border-primary-400]="scheduleType === opt.value"
                    [class.bg-primary-50]="scheduleType === opt.value"
                    [class.border-gray-200]="scheduleType !== opt.value"
                    [class.hover:border-gray-300]="scheduleType !== opt.value"
                    (click)="scheduleType = opt.value"
                  >
                    <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center"
                      [class.border-primary-500]="scheduleType === opt.value"
                      [class.border-gray-300]="scheduleType !== opt.value"
                    >
                      @if (scheduleType === opt.value) {
                        <div class="w-2.5 h-2.5 rounded-full bg-primary-500"></div>
                      }
                    </div>
                    <div>
                      <p class="font-medium text-gray-900">{{ opt.label }}</p>
                      <p class="text-xs text-gray-500">{{ opt.desc }}</p>
                    </div>
                  </div>
                }
              </div>

              @if (scheduleType === 'scheduled') {
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Send Date & Time</label>
                  <p-datepicker [(ngModel)]="scheduledDate" [showTime]="true" hourFormat="12" styleClass="w-full" inputStyleClass="w-full" placeholder="Select date and time" />
                </div>
              }

              <!-- Campaign summary -->
              <div class="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <h4 class="text-sm font-semibold text-gray-700 mb-3">Campaign Summary</h4>
                <div class="space-y-2 text-sm">
                  <div class="flex justify-between">
                    <span class="text-gray-500">Name</span>
                    <span class="font-medium">{{ campaignName || 'Untitled' }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">Type</span>
                    <span class="font-medium capitalize">{{ campaignType }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">Estimated Reach</span>
                    <span class="font-medium text-primary-600">{{ totalReach() | number }} customers</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">Schedule</span>
                    <span class="font-medium capitalize">{{ scheduleType }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="flex justify-between mt-4">
              <button pButton label="Back" icon="pi pi-arrow-left" class="p-button-outlined" (click)="activeStep.set(3)"></button>
              <div class="flex gap-2">
                <button pButton label="Save as Draft" class="p-button-outlined" severity="secondary" [loading]="saving()" (click)="saveDraft()"></button>
                <button pButton [label]="scheduleType === 'immediate' ? 'Launch Campaign' : 'Schedule Campaign'" icon="pi pi-send" severity="success" [loading]="saving()" (click)="launch()"></button>
              </div>
            </div>
            </ng-template>
          </p-step-panel>
        </p-step-panels>
      </p-stepper>
    </div>
  `,
})
export class CampaignFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly messageService = inject(MessageService);
  private readonly campaignService = inject(CampaignService);
  private readonly apiService = inject(ApiService);

  isEdit = signal(false);
  saving = signal(false);
  activeStep = signal(1);

  campaignName = '';
  campaignDesc = '';
  campaignType = 'broadcast';
  selectedSegments: string[] = [];
  messageType = 'text';
  messageText = '';
  selectedTemplate = '';
  scheduleType = 'immediate';
  scheduledDate: Date | null = null;
  totalReach = signal(0);

  segmentRules = signal<{ id: number; field: string; operator: string; value: string }[]>([]);
  private ruleIdCounter = 0;

  typeOptions = [
    { label: 'Broadcast (one-time mass message)', value: 'broadcast' },
    { label: 'Drip (sequential messages)', value: 'drip' },
    { label: 'Triggered (event-based)', value: 'triggered' },
  ];

  segments: Segment[] = [];

  messageTypeOptions = [
    { label: 'Text Message', value: 'text' },
    { label: 'Image + Caption', value: 'image' },
    { label: 'WhatsApp Template', value: 'template' },
    { label: 'Interactive (Buttons)', value: 'interactive' },
  ];

  templates: { id: string; name: string; description: string }[] = [];

  scheduleOptions = [
    { label: 'Send Immediately', value: 'immediate', desc: 'Campaign starts as soon as you launch' },
    { label: 'Schedule for Later', value: 'scheduled', desc: 'Choose a specific date and time to send' },
  ];

  ruleFields = [
    { label: 'Total Spent', value: 'totalSpent' },
    { label: 'Total Orders', value: 'totalOrders' },
    { label: 'Last Order Date', value: 'lastOrderAt' },
    { label: 'Tags', value: 'tags' },
    { label: 'Location (City)', value: 'city' },
    { label: 'Days since last order', value: 'daysSinceOrder' },
  ];

  ruleOperators = [
    { label: 'equals', value: 'equals' },
    { label: 'greater than', value: 'greater_than' },
    { label: 'less than', value: 'less_than' },
    { label: 'contains', value: 'contains' },
    { label: 'between', value: 'between' },
  ];

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEdit.set(true);
      // Load existing campaign data
      this.campaignService.getById(id).subscribe({
        next: (campaign: any) => {
          this.campaignName = campaign.name || '';
          this.campaignDesc = campaign.description || '';
          this.campaignType = campaign.type || 'broadcast';
        },
      });
    }

    // Load segments
    this.campaignService.getSegments().subscribe({
      next: (segments: any) => {
        this.segments = (segments.data || segments || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          customerCount: s.customer_count ?? s.customerCount ?? 0,
        }));
      },
    });

    // Load templates from tenant's template table
    this.apiService.get<any[]>('/campaigns/templates').subscribe({
      next: (templates) => {
        this.templates = (templates || []).map((t: any) => ({
          id: t.id,
          name: t.wa_template_name || t.name || '',
          description: t.category || '',
        }));
      },
      error: () => {
        // Templates endpoint may not exist yet - keep empty
      },
    });
  }

  calcTotalReach() {
    const reach = this.selectedSegments.reduce((sum, segId) => {
      const seg = this.segments.find(s => s.id === segId);
      return sum + (seg?.customerCount ?? 0);
    }, 0);
    this.totalReach.set(reach);
  }

  addSegmentRule() {
    this.segmentRules.update(rules => [...rules, { id: ++this.ruleIdCounter, field: 'totalSpent', operator: 'greater_than', value: '' }]);
  }

  removeRule(id: number) {
    this.segmentRules.update(rules => rules.filter(r => r.id !== id));
  }

  saveDraft() {
    this.saving.set(true);
    this.campaignService.create({
      name: this.campaignName,
      description: this.campaignDesc,
      type: this.campaignType as any,
      targetSegmentIds: this.selectedSegments,
      messages: [],
      scheduledAt: undefined,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.messageService.add({ severity: 'info', summary: 'Saved', detail: 'Campaign saved as draft' });
        setTimeout(() => this.router.navigate(['/campaigns']), 1000);
      },
      error: () => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to save campaign' });
      },
    });
  }

  launch() {
    this.saving.set(true);
    this.campaignService.create({
      name: this.campaignName,
      description: this.campaignDesc,
      type: this.campaignType as any,
      targetSegmentIds: this.selectedSegments,
      messages: [],
      scheduledAt: this.scheduleType === 'scheduled' && this.scheduledDate ? this.scheduledDate.toISOString() : undefined,
    }).subscribe({
      next: (created: any) => {
        if (this.scheduleType === 'immediate') {
          this.campaignService.send(created.id).subscribe({
            next: () => {
              this.saving.set(false);
              this.messageService.add({ severity: 'success', summary: 'Launched!', detail: 'Campaign has been launched successfully' });
              setTimeout(() => this.router.navigate(['/campaigns']), 1200);
            },
            error: () => {
              this.saving.set(false);
              this.messageService.add({ severity: 'warn', summary: 'Created', detail: 'Campaign created but failed to send' });
              setTimeout(() => this.router.navigate(['/campaigns']), 1200);
            },
          });
        } else {
          this.saving.set(false);
          this.messageService.add({ severity: 'success', summary: 'Scheduled!', detail: 'Campaign has been scheduled' });
          setTimeout(() => this.router.navigate(['/campaigns']), 1200);
        }
      },
      error: () => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to create campaign' });
      },
    });
  }
}
