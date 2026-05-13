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
import { ProductService, CreateProductPayload, UpdateProductPayload } from '../../core/services/product.service';

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
                    <label class="text-sm font-medium text-gray-700">SKU</label>
                    <input pInputText formControlName="sku" placeholder="SKU-001" class="w-full" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Barcode</label>
                    <input pInputText formControlName="barcode" placeholder="123456789" class="w-full" />
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
              </div>
            </div>

            <!-- Inventory card -->
            <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 class="text-base font-semibold text-gray-900 mb-4">Inventory</h3>
              <div class="flex items-center gap-2 mb-4">
                <p-toggleswitch formControlName="trackInventory" />
                <span class="text-sm text-gray-700">Track inventory for this product</span>
              </div>
              @if (productForm.get('trackInventory')?.value) {
                <div class="grid grid-cols-2 gap-4">
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Stock Quantity</label>
                    <p-inputnumber formControlName="stockQuantity" [min]="0" styleClass="w-full" inputStyleClass="w-full" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Low Stock Threshold</label>
                    <p-inputnumber formControlName="lowStockThreshold" [min]="0" styleClass="w-full" inputStyleClass="w-full" />
                  </div>
                </div>
              }
            </div>
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

  productForm = this.fb.group({
    name: ['', Validators.required],
    sku: [''],
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
    syncToWhatsApp: [true],
  });

  get f() { return this.productForm.controls; }

  ngOnInit() {
    this.loadCategories();

    this.productId = this.route.snapshot.paramMap.get('id');
    if (this.productId) {
      this.isEditMode.set(true);
      this.loadProduct(this.productId);
    }
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
        price: formValue.price ?? undefined,
        compareAtPrice: formValue.compareAtPrice ?? undefined,
        sku: formValue.sku ?? undefined,
        barcode: formValue.barcode ?? undefined,
        status: formValue.status ?? undefined,
        trackInventory: formValue.trackInventory ?? undefined,
        stockQuantity: formValue.stockQuantity ?? undefined,
        lowStockThreshold: formValue.lowStockThreshold ?? undefined,
        tags: formValue.tags ?? undefined,
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
        price: formValue.price ?? 0,
        compareAtPrice: formValue.compareAtPrice ?? undefined,
        sku: formValue.sku ?? undefined,
        barcode: formValue.barcode ?? undefined,
        status: formValue.status ?? 'active',
        trackInventory: formValue.trackInventory ?? true,
        stockQuantity: formValue.stockQuantity ?? 0,
        lowStockThreshold: formValue.lowStockThreshold ?? 10,
        tags: formValue.tags ?? [],
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

  private loadCategories() {
    this.productService.getCategories().subscribe({
      next: (categories) => {
        this.categoryOptions = categories.map((c) => ({
          label: c.name,
          value: c.id,
        }));
      },
      error: () => {
        this.categoryOptions = [];
      },
    });
  }

  private loadProduct(id: string) {
    this.loadingProduct.set(true);

    this.productService.getById(id).subscribe({
      next: (product) => {
        this.productForm.patchValue({
          name: product.name,
          sku: product.sku ?? '',
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
          tags: product.tags ?? [],
        });

        if (product.imageUrls && product.imageUrls.length > 0) {
          this.previewImages.set([...product.imageUrls]);
        }

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
