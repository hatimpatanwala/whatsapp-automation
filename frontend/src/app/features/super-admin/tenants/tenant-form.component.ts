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
import { TenantService } from '../../../core/services/tenant.service';

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
        <button pButton icon="pi pi-arrow-left" class="p-button-text p-button-rounded text-gray-500" routerLink="/admin/tenants"></button>
        <div>
          <h1 class="text-2xl font-bold text-gray-900">{{ isEdit() ? 'Edit Tenant' : 'New Tenant' }}</h1>
          <p class="text-gray-500 text-sm">{{ isEdit() ? 'Update tenant information' : 'Onboard a new store to the platform' }}</p>
        </div>
      </div>

      @if (loadingEdit()) {
        <div class="text-center py-20 text-gray-500">
          <i class="pi pi-spinner pi-spin" style="font-size:2rem"></i>
          <p class="mt-3">Loading tenant data...</p>
        </div>
      } @else {
        <form [formGroup]="tenantForm" (ngSubmit)="onSubmit()" class="space-y-5">

          <!-- Owner info (only for create) -->
          @if (!isEdit()) {
            <div class="bg-white rounded-xl p-6 border border-gray-200">
              <h3 class="text-base font-semibold text-gray-900 mb-4">Owner Information</h3>
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-600">First Name *</label>
                  <input pInputText formControlName="ownerFirstName" placeholder="John" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-600">Last Name *</label>
                  <input pInputText formControlName="ownerLastName" placeholder="Doe" class="w-full" />
                </div>
                <div class="col-span-2 flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-600">Email Address *</label>
                  <input pInputText type="email" formControlName="ownerEmail" placeholder="owner@business.com" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-600">Password *</label>
                  <input pInputText type="password" formControlName="password" placeholder="••••••••" class="w-full" />
                </div>
              </div>
            </div>
          }

          <!-- Store info -->
          <div class="bg-white rounded-xl p-6 border border-gray-200">
            <h3 class="text-base font-semibold text-gray-900 mb-4">Store Information</h3>
            <div class="space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-600">Store Name *</label>
                  <input pInputText formControlName="name" placeholder="Tech Store NG" class="w-full" (input)="autoSlug()" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-600">Slug *</label>
                  <div class="flex items-center border border-gray-300 rounded-md overflow-hidden">
                    <span class="px-3 py-2 bg-gray-100 text-gray-600 text-sm font-medium">&#64;</span>
                    <input pInputText formControlName="slug" class="border-none flex-1 rounded-none" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- WhatsApp -->
          <div class="bg-white rounded-xl p-6 border border-gray-200">
            <h3 class="text-base font-semibold text-gray-900 mb-4">WhatsApp Configuration</h3>
            <div class="space-y-4">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-600">WhatsApp Phone Number</label>
                <input pInputText formControlName="whatsappPhone" placeholder="+234XXXXXXXXXX" class="w-full" />
              </div>
            </div>
          </div>

          <!-- Status (edit only) -->
          @if (isEdit()) {
            <div class="bg-white rounded-xl p-6 border border-gray-200">
              <h3 class="text-base font-semibold text-gray-900 mb-4">Status</h3>
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-600">Status</label>
                  <p-select formControlName="status" [options]="statusOptions" optionLabel="label" optionValue="value" styleClass="w-full" />
                </div>
              </div>
            </div>
          }

          <!-- Actions -->
          <div class="flex justify-end gap-3 pb-8">
            <button pButton type="button" label="Cancel" class="p-button-outlined text-gray-500" routerLink="/admin/tenants"></button>
            <button pButton type="submit" [label]="isEdit() ? 'Update Tenant' : 'Create Tenant'" icon="pi pi-check" severity="success" [loading]="saving()"></button>
          </div>
        </form>
      }
    </div>
  `,
})
export class TenantFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly messageService = inject(MessageService);
  private readonly tenantService = inject(TenantService);

  isEdit = signal(false);
  saving = signal(false);
  loadingEdit = signal(false);

  statusOptions = [
    { label: 'Active', value: 'active' },
    { label: 'Pending', value: 'pending' },
    { label: 'Suspended', value: 'suspended' },
    { label: 'Trialing', value: 'trialing' },
  ];

  tenantForm = this.fb.group({
    ownerFirstName: [''],
    ownerLastName: [''],
    ownerEmail: [''],
    password: [''],
    name: ['', Validators.required],
    slug: ['', Validators.required],
    whatsappPhone: [''],
    status: ['pending'],
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEdit.set(true);
      this.loadingEdit.set(true);
      this.tenantService.getById(id).subscribe({
        next: (tenant: any) => {
          this.tenantForm.patchValue({
            name: tenant.name || '',
            slug: tenant.slug || '',
            whatsappPhone: tenant.whatsappPhone || '',
            status: tenant.status || 'pending',
          });
          this.loadingEdit.set(false);
        },
        error: (err) => {
          this.loadingEdit.set(false);
          this.messageService.add({ severity: 'error', summary: 'Failed to load tenant', detail: err.error?.message });
        },
      });
    }
  }

  autoSlug() {
    if (this.isEdit()) return;
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

    const id = this.route.snapshot.paramMap.get('id');
    const formVal = this.tenantForm.value;

    if (this.isEdit() && id) {
      this.tenantService.update(id, {
        name: formVal.name || undefined,
        whatsappPhoneNumber: formVal.whatsappPhone || undefined,
      }).subscribe({
        next: () => {
          this.saving.set(false);
          this.messageService.add({ severity: 'success', summary: 'Tenant updated' });
          setTimeout(() => this.router.navigate(['/admin/tenants']), 800);
        },
        error: (err) => {
          this.saving.set(false);
          this.messageService.add({ severity: 'error', summary: 'Failed', detail: err.error?.message });
        },
      });
    } else {
      this.tenantService.create({
        name: formVal.name || '',
        slug: formVal.slug || '',
        ownerName: `${formVal.ownerFirstName || ''} ${formVal.ownerLastName || ''}`.trim(),
        ownerEmail: formVal.ownerEmail || '',
        ownerPassword: formVal.password || '',
      }).subscribe({
        next: () => {
          this.saving.set(false);
          this.messageService.add({ severity: 'success', summary: 'Tenant created successfully' });
          setTimeout(() => this.router.navigate(['/admin/tenants']), 800);
        },
        error: (err) => {
          this.saving.set(false);
          this.messageService.add({ severity: 'error', summary: 'Failed', detail: err.error?.message });
        },
      });
    }
  }
}
