import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { DividerModule } from 'primeng/divider';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MessageService } from 'primeng/api';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'wa-tenant-form',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    FormsModule,
    InputTextModule,
    SelectModule,
    ButtonModule,
    ToastModule,
    DividerModule,
    ToggleSwitchModule,
  ],
  providers: [MessageService],
  template: `
    <div class="p-6 max-w-3xl mx-auto">
      <p-toast />

      <div class="flex items-center gap-4 mb-6">
        <button pButton icon="pi pi-arrow-left" class="p-button-text p-button-rounded text-gray-400" routerLink="/admin/tenants"></button>
        <div>
          <h1 class="text-2xl font-bold text-white">{{ isEdit() ? 'Edit Tenant' : 'New Tenant' }}</h1>
          <p class="text-gray-400 text-sm">{{ isEdit() ? 'Update tenant information' : 'Onboard a new store to the platform' }}</p>
        </div>
      </div>

      <form [formGroup]="tenantForm" (ngSubmit)="onSubmit()" class="space-y-5">

        <!-- Owner info -->
        <div class="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h3 class="text-base font-semibold text-white mb-4">Owner Information</h3>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-300">First Name *</label>
              <input pInputText formControlName="ownerFirstName" placeholder="John" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-300">Last Name *</label>
              <input pInputText formControlName="ownerLastName" placeholder="Doe" class="w-full" />
            </div>
            <div class="col-span-2 flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-300">Email Address *</label>
              <input pInputText type="email" formControlName="ownerEmail" placeholder="owner@business.com" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-300">Password {{ isEdit() ? '(leave blank to keep)' : '*' }}</label>
              <input pInputText type="password" formControlName="password" placeholder="••••••••" class="w-full" />
            </div>
          </div>
        </div>

        <!-- Store info -->
        <div class="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h3 class="text-base font-semibold text-white mb-4">Store Information</h3>
          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-300">Store Name *</label>
                <input pInputText formControlName="name" placeholder="Tech Store NG" class="w-full" (input)="autoSlug()" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-300">Slug *</label>
                <div class="flex items-center border border-gray-600 rounded-md overflow-hidden">
                  <span class="px-3 py-2 bg-gray-800 text-gray-400 text-sm">&#64;</span>
                  <input pInputText formControlName="slug" class="border-none flex-1 rounded-none bg-gray-900 text-white" />
                </div>
              </div>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-300">Custom Domain (optional)</label>
              <input pInputText formControlName="domain" placeholder="store.yourdomain.com" class="w-full" />
            </div>
          </div>
        </div>

        <!-- WhatsApp -->
        <div class="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h3 class="text-base font-semibold text-white mb-4">WhatsApp Configuration</h3>
          <div class="space-y-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-300">WhatsApp Phone Number</label>
              <input pInputText formControlName="whatsappPhone" placeholder="+234XXXXXXXXXX" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-300">WhatsApp Business Account ID</label>
              <input pInputText formControlName="whatsappAccountId" placeholder="Meta Business Account ID" class="w-full" />
            </div>
          </div>
        </div>

        <!-- Plan + Status -->
        <div class="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h3 class="text-base font-semibold text-white mb-4">Subscription & Status</h3>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-300">Subscription Plan</label>
              <p-select formControlName="planId" [options]="planOptions" optionLabel="label" optionValue="value"
                placeholder="Select plan" styleClass="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-300">Status</label>
              <p-select formControlName="status" [options]="statusOptions" optionLabel="label" optionValue="value" styleClass="w-full" />
            </div>
          </div>
          <div class="flex items-center gap-3 mt-4">
            <p-toggleswitch formControlName="trialEnabled" />
            <span class="text-sm text-gray-300">Start with 14-day trial</span>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex justify-end gap-3 pb-8">
          <button pButton type="button" label="Cancel" class="p-button-outlined text-gray-400" routerLink="/admin/tenants"></button>
          <button pButton type="submit" [label]="isEdit() ? 'Update Tenant' : 'Create Tenant'" icon="pi pi-check" severity="success" [loading]="saving()"></button>
        </div>
      </form>
    </div>
  `,
})
export class TenantFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly messageService = inject(MessageService);

  isEdit = signal(false);
  saving = signal(false);

  planOptions = [
    { label: 'Starter - $49/mo', value: 'plan-starter' },
    { label: 'Growth - $190/mo', value: 'plan-growth' },
    { label: 'Professional - $390/mo', value: 'plan-pro' },
    { label: 'Enterprise - $790/mo', value: 'plan-enterprise' },
  ];

  statusOptions = [
    { label: 'Active', value: 'active' },
    { label: 'Pending', value: 'pending' },
    { label: 'Suspended', value: 'suspended' },
    { label: 'Trialing', value: 'trialing' },
  ];

  tenantForm = this.fb.group({
    ownerFirstName: ['', Validators.required],
    ownerLastName: ['', Validators.required],
    ownerEmail: ['', [Validators.required, Validators.email]],
    password: [''],
    name: ['', Validators.required],
    slug: ['', Validators.required],
    domain: [''],
    whatsappPhone: [''],
    whatsappAccountId: [''],
    planId: ['plan-starter'],
    status: ['pending'],
    trialEnabled: [true],
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEdit.set(true);
      this.tenantForm.patchValue({
        ownerFirstName: 'Tech',
        ownerLastName: 'Admin',
        ownerEmail: 'tech@gadgets.com',
        name: 'TechGadgets Store',
        slug: 'techgadgets',
        planId: 'plan-growth',
        status: 'active',
        trialEnabled: false,
      });
    }
  }

  autoSlug() {
    const name = this.tenantForm.get('name')?.value ?? '';
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    this.tenantForm.patchValue({ slug }, { emitEvent: false });
  }

  onSubmit() {
    if (this.tenantForm.invalid) {
      this.tenantForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    setTimeout(() => {
      this.saving.set(false);
      this.messageService.add({
        severity: 'success',
        summary: 'Success',
        detail: this.isEdit() ? 'Tenant updated successfully' : 'Tenant created and invitation sent',
      });
      setTimeout(() => this.router.navigate(['/admin/tenants']), 1200);
    }, 1000);
  }
}
