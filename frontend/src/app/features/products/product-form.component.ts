import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ToastModule } from 'primeng/toast';
import { FileUploadModule } from 'primeng/fileupload';
import { ChipModule } from 'primeng/chip';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ProductService, CreateProductPayload, UpdateProductPayload } from '../../core/services/product.service';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'wa-product-form',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    InputNumberModule,
    ToggleSwitchModule,
    ButtonModule,
    CardModule,
    ToastModule,
    FileUploadModule,
    ChipModule,
    FormsModule,
  ],
  providers: [MessageService],
  template: `
    <div class="p-6 max-w-4xl mx-auto">
      <p-toast />

      <!-- Header -->
      <div class="flex items-center gap-4 mb-6">
        <button pButton icon="pi pi-arrow-left" class="p-button-text p-button-rounded" routerLink="/products"></button>
        <div>
          <h1 class="text-2xl font-bold text-gray-900">{{ isEditMode() ? 'Edit Product' : 'New Product' }}</h1>
          <p class="text-gray-500 text-sm">{{ isEditMode() ? 'Update product details' : 'Add a new product to your catalog' }}</p>
        </div>
      </div>

      <form [formGroup]="productForm" (ngSubmit)="onSubmit()" class="space-y-6">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

          <!-- Main info -->
          <div class="lg:col-span-2 space-y-5">

            <!-- Basic info card -->
            <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 class="text-base font-semibold text-gray-900 mb-4">Basic Information</h3>
              <div class="space-y-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Product Name *</label>
                  <input pInputText formControlName="name" placeholder="e.g. Premium Wireless Earbuds" class="w-full" />
                  @if (f['name'].invalid && f['name'].touched) {
                    <span class="text-xs text-red-500">Product name is required</span>
                  }
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Item Type</label>
                    <select formControlName="itemType" class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white">
                      @for (t of itemTypeOptions; track t.value) { <option [value]="t.value">{{ t.label }}</option> }
                    </select>
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">SKU</label>
                    <input pInputText formControlName="sku" placeholder="SKU-001" class="w-full" />
                  </div>
                </div>

                <div class="grid grid-cols-3 gap-4">
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Unit of Measurement *</label>
                    <select formControlName="uom" class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white">
                      @for (u of uomOptions; track u.value) { <option [value]="u.value">{{ u.label }}</option> }
                    </select>
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Alt Unit <span class="text-xs text-gray-400">(e.g. box)</span></label>
                    <select formControlName="altUom" class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white">
                      <option value="">— none —</option>
                      @for (u of uomOptions; track u.value) { <option [value]="u.value">{{ u.label }}</option> }
                    </select>
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Conversion <span class="text-xs text-gray-400">(1 alt = ? base)</span></label>
                    <p-inputnumber formControlName="uomFactor" [min]="0" [maxFractionDigits]="4" placeholder="e.g. 12" styleClass="w-full" inputStyleClass="w-full" />
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Barcode</label>
                    <input pInputText formControlName="barcode" placeholder="123456789" class="w-full" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">UQC <span class="text-xs text-gray-400">(GST unit code)</span></label>
                    <select formControlName="uqc" class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white">
                      <option value="">— auto —</option>
                      @for (u of uqcOptions; track u.value) { <option [value]="u.value">{{ u.label }}</option> }
                    </select>
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">HSN / SAC Code <span class="text-xs text-gray-400">(optional, for invoices)</span></label>
                    <input pInputText formControlName="hsnCode" placeholder="e.g. 6109" class="w-full" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Tax Rate <span class="text-xs text-gray-400">(optional)</span></label>
                    <p-select [options]="taxRateOptions" [(ngModel)]="taxSelection" [ngModelOptions]="{ standalone: true }"
                      (onChange)="onTaxChange($event.value)" optionLabel="label" optionValue="value" [showClear]="true"
                      styleClass="w-full" placeholder="Select a tax rate" appendTo="body" />
                    @if (taxSelection === 'custom') {
                      <input pInputText type="number" formControlName="gstRate" placeholder="Custom %, e.g. 18" class="w-full mt-2" />
                    }
                  </div>
                </div>

                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Short Description</label>
                  <input pInputText formControlName="shortDescription" placeholder="Brief product summary" class="w-full" />
                </div>

                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Full Description</label>
                  <textarea
                    pTextarea
                    formControlName="description"
                    placeholder="Detailed product description..."
                    rows="4"
                    class="w-full"
                  ></textarea>
                </div>

                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Tags</label>
                  <div class="flex flex-wrap gap-2 border border-gray-300 rounded-md p-2 min-h-10">
                    @for (tag of productForm.get('tags')?.value || []; track tag) {
                      <span class="flex items-center gap-1 bg-primary-50 text-primary-700 border border-primary-200 rounded-full px-2.5 py-0.5 text-xs">
                        {{ tag }}
                        <button type="button" (click)="removeTag(tag)" class="text-primary-400 hover:text-red-500"><i class="pi pi-times" style="font-size:0.6rem"></i></button>
                      </span>
                    }
                    <input class="border-none outline-none text-sm flex-1 min-w-20" [(ngModel)]="tagInput" [ngModelOptions]="{standalone: true}" placeholder="Add tag, press Enter" (keydown.enter)="addTag($event)" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Pricing card -->
            <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 class="text-base font-semibold text-gray-900 mb-4">Pricing</h3>
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Price (\u20B9) *</label>
                  <p-inputnumber formControlName="price" mode="currency" currency="INR" locale="en-IN" placeholder="0.00" styleClass="w-full" inputStyleClass="w-full" />
                  @if (f['price'].invalid && f['price'].touched) {
                    <span class="text-xs text-red-500">Price is required</span>
                  }
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Compare-at Price (\u20B9)</label>
                  <p-inputnumber formControlName="compareAtPrice" mode="currency" currency="INR" locale="en-IN" placeholder="0.00" styleClass="w-full" inputStyleClass="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">MRP (\u20B9)</label>
                  <p-inputnumber formControlName="mrp" mode="currency" currency="INR" locale="en-IN" placeholder="0.00" styleClass="w-full" inputStyleClass="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Purchase Rate (\u20B9)</label>
                  <p-inputnumber formControlName="purchasePrice" mode="currency" currency="INR" locale="en-IN" placeholder="0.00" styleClass="w-full" inputStyleClass="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Wholesale Price (\u20B9)</label>
                  <p-inputnumber formControlName="wholesalePrice" mode="currency" currency="INR" locale="en-IN" placeholder="0.00" styleClass="w-full" inputStyleClass="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Wholesale Min Qty</label>
                  <p-inputnumber formControlName="wholesaleMinQty" [min]="0" placeholder="e.g. 10" styleClass="w-full" inputStyleClass="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Default Sale Discount %</label>
                  <p-inputnumber formControlName="saleDiscountPct" [min]="0" [max]="100" [maxFractionDigits]="2" placeholder="0" styleClass="w-full" inputStyleClass="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Cess %</label>
                  <p-inputnumber formControlName="cessPct" [min]="0" [maxFractionDigits]="2" placeholder="0" styleClass="w-full" inputStyleClass="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Min Sale Price (\u20B9) <span class="text-xs text-gray-400">(floor)</span></label>
                  <p-inputnumber formControlName="minSalePrice" mode="currency" currency="INR" locale="en-IN" placeholder="0.00" styleClass="w-full" inputStyleClass="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Max Sale Price (\u20B9) <span class="text-xs text-gray-400">(cap)</span></label>
                  <p-inputnumber formControlName="maxSalePrice" mode="currency" currency="INR" locale="en-IN" placeholder="0.00" styleClass="w-full" inputStyleClass="w-full" />
                </div>
              </div>
              <div class="flex flex-wrap gap-6 mt-4">
                <label class="inline-flex items-center gap-2">
                  <p-toggleswitch formControlName="priceIncludesTax" />
                  <span class="text-sm text-gray-700">Price includes tax <span class="text-xs text-gray-400">(billing derives the exclusive rate)</span></span>
                </label>
                <label class="inline-flex items-center gap-2">
                  <p-toggleswitch formControlName="taxExempt" />
                  <span class="text-sm text-gray-700">Tax exempt / Nil-rated</span>
                </label>
              </div>
            </div>

            <!-- Inventory card -->
            <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 class="text-base font-semibold text-gray-900 mb-4">Inventory</h3>
              <div class="flex items-center gap-2 mb-4">
                <p-toggleswitch formControlName="trackInventory" />
                <span class="text-sm text-gray-700">Track inventory for this product</span>
              </div>
              @if (productForm.get('trackInventory')?.value && productForm.get('itemType')?.value !== 'service') {
                <div class="grid grid-cols-2 gap-4">
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Stock Quantity</label>
                    <p-inputnumber formControlName="stockQuantity" [min]="0" styleClass="w-full" inputStyleClass="w-full" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Low Stock Threshold</label>
                    <p-inputnumber formControlName="lowStockThreshold" [min]="0" styleClass="w-full" inputStyleClass="w-full" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Max Stock <span class="text-xs text-gray-400">(over-stock alert)</span></label>
                    <p-inputnumber formControlName="maxStock" [min]="0" styleClass="w-full" inputStyleClass="w-full" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Rack / Shelf Location</label>
                    <input pInputText formControlName="rackLocation" placeholder="e.g. A-12" class="w-full" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Opening Stock Rate (₹) <span class="text-xs text-gray-400">(valuation)</span></label>
                    <p-inputnumber formControlName="openingRate" mode="currency" currency="INR" locale="en-IN" placeholder="0.00" styleClass="w-full" inputStyleClass="w-full" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Opening Stock Date</label>
                    <input type="date" formControlName="openingStockDate" class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                  </div>
                </div>
                <div class="flex flex-col gap-1 mt-4">
                  <label class="text-sm font-medium text-gray-700">Stock Tracking</label>
                  <div class="flex gap-4">
                    @for (t of trackingOptions; track t.value) {
                      <label class="inline-flex items-center gap-1.5 text-sm text-gray-700">
                        <input type="radio" formControlName="trackingMode" [value]="t.value" class="accent-green-600" /> {{ t.label }}
                      </label>
                    }
                  </div>
                  <p class="text-xs text-gray-400">Batch tracking enables MRP-wise lots in purchases and billing (same as the ERP item master).</p>
                </div>
              }
            </div>

            <!-- Custom fields (admin-defined under Settings → Custom Fields) -->
            @if (productCustomFields().length) {
              <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 class="text-base font-semibold text-gray-900 mb-4">Custom Fields</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  @for (cf of productCustomFields(); track cf.id) {
                    <div class="flex flex-col gap-1" [class.md:col-span-2]="cf.field_type === 'textarea'">
                      <label class="text-sm font-medium text-gray-700">{{ cf.label }}@if (cf.is_required) { <span class="text-red-500">*</span> }</label>
                      @switch (cf.field_type) {
                        @case ('textarea') {
                          <textarea [(ngModel)]="customFieldValues[cf.field_key]" [ngModelOptions]="{standalone:true}" rows="2" [placeholder]="cf.placeholder || ''" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></textarea>
                        }
                        @case ('select') {
                          <select [(ngModel)]="customFieldValues[cf.field_key]" [ngModelOptions]="{standalone:true}" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                            <option value="">Select…</option>
                            @for (o of cf.options; track o) { <option [value]="o">{{ o }}</option> }
                          </select>
                        }
                        @case ('boolean') {
                          <label class="inline-flex items-center gap-2 mt-1"><input type="checkbox" [(ngModel)]="customFieldValues[cf.field_key]" [ngModelOptions]="{standalone:true}" class="w-5 h-5 accent-green-600" /> <span class="text-sm text-gray-600">Yes</span></label>
                        }
                        @case ('number') {
                          <input type="number" [(ngModel)]="customFieldValues[cf.field_key]" [ngModelOptions]="{standalone:true}" [placeholder]="cf.placeholder || ''" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                        }
                        @case ('date') {
                          <input type="date" [(ngModel)]="customFieldValues[cf.field_key]" [ngModelOptions]="{standalone:true}" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                        }
                        @default {
                          <input [type]="cf.field_type === 'email' ? 'email' : (cf.field_type === 'phone' ? 'tel' : 'text')" [(ngModel)]="customFieldValues[cf.field_key]" [ngModelOptions]="{standalone:true}" [placeholder]="cf.placeholder || ''" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                        }
                      }
                      @if (cf.help_text) { <p class="text-xs text-gray-400">{{ cf.help_text }}</p> }
                    </div>
                  }
                </div>
              </div>
            }
          </div>

          <!-- Right sidebar -->
          <div class="space-y-5">

            <!-- Status + Category -->
            <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 class="text-base font-semibold text-gray-900 mb-4">Organization</h3>
              <div class="space-y-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Status</label>
                  <p-select
                    formControlName="status"
                    [options]="statusOptions"
                    optionLabel="label"
                    optionValue="value"
                    styleClass="w-full"
                  />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Category</label>
                  <p-select
                    formControlName="categoryId"
                    [options]="categoryOptions"
                    optionLabel="label"
                    optionValue="value"
                    placeholder="Select category"
                    styleClass="w-full"
                  />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Brand</label>
                  <p-select
                    formControlName="brandId"
                    [options]="brandOptions"
                    optionLabel="label"
                    optionValue="value"
                    placeholder="Select brand"
                    styleClass="w-full"
                  />
                </div>
              </div>
            </div>

            <!-- WhatsApp Catalog -->
            <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 class="text-base font-semibold text-gray-900 mb-4">WhatsApp Catalog</h3>
              <div class="flex items-center gap-2 mb-2">
                <p-toggleswitch formControlName="syncToWhatsApp" />
                <span class="text-sm text-gray-700">Sync to WhatsApp Catalog</span>
              </div>
              <p class="text-xs text-gray-400">When enabled, this product will be synced to your WhatsApp Commerce catalog so customers can browse it directly in WhatsApp.</p>
              @if (isEditMode() && productForm.get('syncToWhatsApp')?.value) {
                <button pButton type="button" label="Sync Now" icon="pi pi-sync" class="p-button-sm p-button-outlined mt-3 w-full"
                  [loading]="syncingToWhatsApp()" (click)="syncProductToWhatsApp()"></button>
              }
            </div>

            <!-- Image upload -->
            <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 class="text-base font-semibold text-gray-900 mb-4">Product Images</h3>
              <p-fileupload
                mode="basic"
                accept="image/*"
                [maxFileSize]="5000000"
                chooseLabel="Upload Images"
                chooseIcon="pi pi-upload"
                class="w-full"
                (onSelect)="onImageSelect($event)"
              />
              @if (previewImages().length) {
                <div class="grid grid-cols-3 gap-2 mt-3">
                  @for (img of previewImages(); track img) {
                    <div class="relative aspect-square rounded-lg overflow-hidden border border-gray-200">
                      <img [src]="img" class="w-full h-full object-cover" />
                    </div>
                  }
                </div>
              } @else {
                <div class="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center mt-3">
                  <i class="pi pi-image text-gray-300" style="font-size:2rem"></i>
                  <p class="text-sm text-gray-400 mt-2">No images yet</p>
                </div>
              }
            </div>
          </div>
        </div>

        <!-- Form actions -->
        <div class="flex justify-end gap-3 pb-8">
          <button pButton type="button" label="Cancel" class="p-button-outlined" routerLink="/products"></button>
          <button pButton type="button" label="Save as Draft" class="p-button-outlined" severity="secondary" (click)="saveAsDraft()"></button>
          <button pButton type="submit" [label]="isEditMode() ? 'Update Product' : 'Publish Product'" icon="pi pi-check" severity="success" [loading]="saving()"></button>
        </div>
      </form>
    </div>
  `,
})
export class ProductFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly messageService = inject(MessageService);
  private readonly productService = inject(ProductService);
  private readonly api = inject(ApiService);

  // Admin-defined product custom fields (Settings → Custom Fields).
  productCustomFields = signal<any[]>([]);
  customFieldValues: Record<string, any> = {};

  isEditMode = signal(false);
  saving = signal(false);
  loadingProduct = signal(false);
  syncingToWhatsApp = signal(false);
  previewImages = signal<string[]>([]);
  tagInput = '';
  private productId: string | null = null;
  private uploadedFiles: File[] = [];

  statusOptions = [
    { label: 'Active', value: 'active' },
    { label: 'Draft', value: 'draft' },
    { label: 'Archived', value: 'archived' },
  ];

  categoryOptions: { label: string; value: string }[] = [];
  brandOptions: { label: string; value: string }[] = [];
  /** Tax rate dropdown: defined rates (percentages) + a "Custom rate…" option. */
  taxRateOptions: { label: string; value: number | 'custom' }[] = [];
  taxSelection: number | 'custom' | null = null;

  uomOptions: { label: string; value: string }[] = [
    { value: 'pcs', label: 'Piece (pcs)' }, { value: 'unit', label: 'Unit' },
    { value: 'kg', label: 'Kilogram (kg)' }, { value: 'g', label: 'Gram (g)' },
    { value: 'l', label: 'Litre (L)' }, { value: 'ml', label: 'Millilitre (ml)' },
    { value: 'm', label: 'Metre (m)' }, { value: 'cm', label: 'Centimetre (cm)' },
    { value: 'box', label: 'Box' }, { value: 'pack', label: 'Pack' },
    { value: 'dozen', label: 'Dozen' }, { value: 'pair', label: 'Pair' },
    { value: 'set', label: 'Set' }, { value: 'bottle', label: 'Bottle' },
    { value: 'bag', label: 'Bag' }, { value: 'carton', label: 'Carton' },
    { value: 'sqft', label: 'Sq. ft' }, { value: 'sqm', label: 'Sq. m' },
  ];

  productForm = this.fb.group({
    name: ['', Validators.required],
    sku: [''],
    uom: ['pcs', Validators.required],
    barcode: [''],
    shortDescription: [''],
    description: [''],
    tags: [[] as string[]],
    price: [null as number | null, [Validators.required, Validators.min(0)]],
    compareAtPrice: [null as number | null],
    trackInventory: [true],
    stockQuantity: [0],
    lowStockThreshold: [10],
    status: ['active'],
    categoryId: [''],
    brandId: [''],
    hsnCode: [''],
    gstRate: [null as number | null],
    syncToWhatsApp: [true],
    // ERP item-master parity — same field set as the keyboard-view Item Master.
    itemType: ['product'],
    uqc: [''],
    altUom: [''],
    uomFactor: [null as number | null],
    purchasePrice: [null as number | null],
    mrp: [null as number | null],
    wholesalePrice: [null as number | null],
    wholesaleMinQty: [null as number | null],
    saleDiscountPct: [null as number | null],
    priceIncludesTax: [false],
    minSalePrice: [null as number | null],
    maxSalePrice: [null as number | null],
    cessPct: [null as number | null],
    taxExempt: [false],
    openingRate: [null as number | null],
    openingStockDate: [''],
    maxStock: [null as number | null],
    rackLocation: [''],
    trackingMode: ['none'],
  });

  itemTypeOptions = [
    { label: 'Product (goods, tracks stock)', value: 'product' },
    { label: 'Service (no stock)', value: 'service' },
  ];
  trackingOptions = [
    { label: 'None', value: 'none' },
    { label: 'Batch / MRP-wise lots', value: 'batch' },
    { label: 'Serial numbers', value: 'serial' },
  ];
  uqcOptions: { label: string; value: string }[] =
    ['BAG','BAL','BDL','BOX','BTL','CAN','CTN','DOZ','DRM','GMS','KGS','KLR','LTR','MTR','MTS','NOS','PAC','PCS','PRS','QTL','ROL','SET','SQF','SQM','TBS','TON','UNT']
      .map((c) => ({ label: c, value: c }));

  get f() { return this.productForm.controls; }

  /** Dropdown → gstRate. 'custom' reveals the number input; clearing sets no tax. */
  onTaxChange(v: number | 'custom' | null): void {
    if (v === 'custom') return;
    this.f.gstRate.setValue(v == null ? null : Number(v));
  }
  /** Set the dropdown to match the loaded gstRate (a known rate, else 'Custom'). */
  private syncTaxSelection(): void {
    const g = this.f.gstRate.value;
    if (g == null) { this.taxSelection = null; return; }
    const match = this.taxRateOptions.find((o) => o.value === Number(g));
    this.taxSelection = match ? (match.value as number) : 'custom';
  }

  ngOnInit() {
    this.productId = this.route.snapshot.paramMap.get('id');
    // Active product custom fields → rendered as a "Custom Fields" card.
    this.api.get<any>('/custom-fields', { entity: 'product' } as any).subscribe({
      next: (r) => {
        const arr = Array.isArray(r) ? r : (r?.data ?? r?.items ?? []);
        this.productCustomFields.set(arr.filter((f: any) => (f.is_active ?? f.isActive) !== false)
          .map((f: any) => ({ ...f, field_key: f.field_key ?? f.fieldKey, field_type: f.field_type ?? f.fieldType ?? 'text', options: f.options ?? [], help_text: f.help_text ?? f.helpText, is_required: f.is_required ?? f.isRequired })));
      },
      error: () => this.productCustomFields.set([]),
    });
    // Load category + brand options BEFORE patching the product. PrimeNG's
    // p-select won't display a value that was set before its options exist,
    // so loading these in parallel with the product made the saved
    // category/brand render blank on the edit form.
    forkJoin({
      categories: this.productService.getCategories().pipe(catchError(() => of([]))),
      brands: this.productService.getBrands().pipe(catchError(() => of([]))),
      taxRates: this.api.get<any>('/tax-rates').pipe(catchError(() => of([]))),
    }).subscribe(({ categories, brands, taxRates }) => {
      this.categoryOptions = (categories || []).map((c) => ({ label: c.name, value: c.id }));
      this.brandOptions = (brands || []).map((b) => ({ label: b.name, value: b.id }));
      const rates = Array.isArray(taxRates) ? taxRates : (taxRates?.data ?? taxRates?.items ?? []);
      const seen = new Set<number>();
      this.taxRateOptions = [
        ...rates
          .filter((r: any) => (r.enabled ?? true) !== false)
          .map((r: any) => ({ label: `${r.name} — ${Number(r.rate)}%`, value: Number(r.rate) }))
          .filter((o: any) => (seen.has(o.value) ? false : (seen.add(o.value), true))),
        { label: 'Custom rate…', value: 'custom' as const },
      ];
      if (this.productId) {
        this.isEditMode.set(true);
        this.loadProduct(this.productId);
      }
    });
  }

  onImageSelect(event: any) {
    const files = event.files as File[];
    files.forEach(file => {
      this.uploadedFiles.push(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        this.previewImages.update(imgs => [...imgs, e.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
  }

  addTag(event: Event) {
    event.preventDefault();
    const val = this.tagInput.trim();
    if (!val) return;
    const currentTags = this.productForm.get('tags')?.value ?? [];
    if (!currentTags.includes(val)) {
      this.productForm.patchValue({ tags: [...currentTags, val] });
    }
    this.tagInput = '';
  }

  removeTag(tag: string) {
    const current = this.productForm.get('tags')?.value ?? [];
    this.productForm.patchValue({ tags: current.filter((t: string) => t !== tag) });
  }

  syncProductToWhatsApp() {
    if (!this.productId) return;
    this.syncingToWhatsApp.set(true);
    this.productService.syncCatalog([this.productId]).subscribe({
      next: (res) => {
        this.syncingToWhatsApp.set(false);
        this.messageService.add({
          severity: res.errors > 0 ? 'warn' : 'success',
          summary: res.errors > 0 ? 'Partial Sync' : 'Synced',
          detail: `${res.synced} synced, ${res.errors} errors`,
        });
      },
      error: () => {
        this.syncingToWhatsApp.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to sync to WhatsApp' });
      },
    });
  }

  saveAsDraft() {
    this.productForm.patchValue({ status: 'draft' });
    this.onSubmit();
  }

  /** ERP item-master parity fields, shared by the create and update payloads. */
  private parityFields(v: ReturnType<typeof this.productForm.getRawValue>) {
    return {
      itemType: v.itemType ?? 'product',
      uqc: v.uqc || undefined,
      altUom: v.altUom || undefined,
      uomFactor: v.uomFactor ?? undefined,
      purchasePrice: v.purchasePrice ?? undefined,
      mrp: v.mrp ?? undefined,
      wholesalePrice: v.wholesalePrice ?? undefined,
      wholesaleMinQty: v.wholesaleMinQty ?? undefined,
      saleDiscountPct: v.saleDiscountPct ?? undefined,
      priceIncludesTax: v.priceIncludesTax ?? false,
      minSalePrice: v.minSalePrice ?? undefined,
      maxSalePrice: v.maxSalePrice ?? undefined,
      cessPct: v.cessPct ?? undefined,
      taxExempt: v.taxExempt ?? false,
      openingRate: v.openingRate ?? undefined,
      openingStockDate: v.openingStockDate || undefined,
      maxStock: v.maxStock ?? undefined,
      rackLocation: v.rackLocation || undefined,
      trackingMode: v.trackingMode ?? 'none',
    };
  }

  onSubmit() {
    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);

    const formValue = this.productForm.getRawValue();

    if (this.isEditMode() && this.productId) {
      const payload: UpdateProductPayload = {
        name: formValue.name ?? undefined,
        description: formValue.description ?? undefined,
        shortDescription: formValue.shortDescription ?? undefined,
        categoryId: formValue.categoryId ?? undefined,
        brandId: formValue.brandId ?? undefined,
        hsnCode: formValue.hsnCode ?? undefined,
        gstRate: formValue.gstRate ?? undefined,
        price: formValue.price ?? undefined,
        compareAtPrice: formValue.compareAtPrice ?? undefined,
        sku: formValue.sku ?? undefined,
        uom: formValue.uom ?? 'pcs',
        barcode: formValue.barcode ?? undefined,
        status: formValue.status ?? undefined,
        trackInventory: formValue.trackInventory ?? undefined,
        stockQuantity: formValue.stockQuantity ?? undefined,
        lowStockThreshold: formValue.lowStockThreshold ?? undefined,
        tags: formValue.tags ?? undefined,
        customFields: this.customFieldValues,
        ...this.parityFields(formValue),
      };

      this.productService.update(this.productId, payload).subscribe({
        next: () => {
          this.saving.set(false);
          const syncEnabled = this.productForm.get('syncToWhatsApp')?.value;
          if (syncEnabled && this.productId) {
            this.productService.syncCatalog([this.productId]).subscribe({
              next: () => this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Product updated and synced to WhatsApp' }),
              error: () => this.messageService.add({ severity: 'warn', summary: 'Updated', detail: 'Product updated but WhatsApp sync failed' }),
            });
          } else {
            this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Product updated successfully' });
          }
          setTimeout(() => this.router.navigate(['/products']), 1000);
        },
        error: (err) => {
          this.saving.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to update product',
          });
        },
      });
    } else {
      const payload: CreateProductPayload = {
        name: formValue.name ?? '',
        description: formValue.description ?? undefined,
        shortDescription: formValue.shortDescription ?? undefined,
        categoryId: formValue.categoryId ?? undefined,
        brandId: formValue.brandId ?? undefined,
        hsnCode: formValue.hsnCode ?? undefined,
        gstRate: formValue.gstRate ?? undefined,
        price: formValue.price ?? 0,
        compareAtPrice: formValue.compareAtPrice ?? undefined,
        sku: formValue.sku ?? undefined,
        uom: formValue.uom ?? 'pcs',
        barcode: formValue.barcode ?? undefined,
        status: formValue.status ?? 'active',
        trackInventory: formValue.trackInventory ?? true,
        stockQuantity: formValue.stockQuantity ?? 0,
        lowStockThreshold: formValue.lowStockThreshold ?? 10,
        tags: formValue.tags ?? [],
        customFields: this.customFieldValues,
        ...this.parityFields(formValue),
      };

      this.productService.create(payload).subscribe({
        next: (product) => {
          this.saving.set(false);
          const syncEnabled = this.productForm.get('syncToWhatsApp')?.value;
          if (syncEnabled && product?.id) {
            this.productService.syncCatalog([product.id]).subscribe({
              next: () => this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Product created and synced to WhatsApp' }),
              error: () => this.messageService.add({ severity: 'warn', summary: 'Created', detail: 'Product created but WhatsApp sync failed' }),
            });
          } else {
            this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Product created successfully' });
          }
          setTimeout(() => this.router.navigate(['/products']), 1000);
        },
        error: (err) => {
          this.saving.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to create product',
          });
        },
      });
    }
  }

  private loadProduct(id: string) {
    this.loadingProduct.set(true);

    this.productService.getById(id).subscribe({
      next: (product) => {
        this.productForm.patchValue({
          name: product.name,
          sku: product.sku ?? '',
          uom: (product as any).uom ?? 'pcs',
          barcode: product.barcode ?? '',
          shortDescription: product.shortDescription ?? '',
          description: product.description ?? '',
          price: product.price,
          compareAtPrice: product.compareAtPrice ?? null,
          trackInventory: product.trackInventory,
          stockQuantity: product.stockQuantity,
          lowStockThreshold: product.lowStockThreshold ?? 10,
          status: product.status,
          categoryId: product.categoryId ?? '',
          brandId: (product as any).brandId ?? (product as any).brand_id ?? '',
          hsnCode: (product as any).hsnCode ?? '',
          gstRate: (product as any).gstRate ?? null,
          tags: product.tags ?? [],
          itemType: (product as any).itemType ?? 'product',
          uqc: (product as any).uqc ?? '',
          altUom: (product as any).altUom ?? '',
          uomFactor: (product as any).uomFactor ?? null,
          purchasePrice: (product as any).purchasePrice ?? null,
          mrp: (product as any).mrp ?? null,
          wholesalePrice: (product as any).wholesalePrice ?? null,
          wholesaleMinQty: (product as any).wholesaleMinQty ?? null,
          saleDiscountPct: (product as any).saleDiscountPct ?? null,
          priceIncludesTax: (product as any).priceIncludesTax ?? false,
          minSalePrice: (product as any).minSalePrice ?? null,
          maxSalePrice: (product as any).maxSalePrice ?? null,
          cessPct: (product as any).cessPct ?? null,
          taxExempt: (product as any).taxExempt ?? false,
          openingRate: (product as any).openingRate ?? null,
          openingStockDate: ((product as any).openingStockDate || '').slice(0, 10),
          maxStock: (product as any).maxStock ?? null,
          rackLocation: (product as any).rackLocation ?? '',
          trackingMode: (product as any).trackingMode ?? 'none',
        });
        this.syncTaxSelection();

        if (product.imageUrls && product.imageUrls.length > 0) {
          this.previewImages.set([...product.imageUrls]);
        }

        this.customFieldValues = { ...((product as any).customFields ?? (product as any).custom_fields ?? {}) };

        this.loadingProduct.set(false);
      },
      error: (err) => {
        this.loadingProduct.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load product',
        });
        this.router.navigate(['/products']);
      },
    });
  }
}
