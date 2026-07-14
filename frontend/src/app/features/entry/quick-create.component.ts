import { Component, ElementRef, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EntryService } from '../../core/services/entry.service';
import { validateGstin } from '../../core/utils/gst-validation';

export type QuickKind = 'customer' | 'product' | 'supplier';
export interface QuickCreated {
  kind: QuickKind;
  id: string;
  name: string;
  /** product extras so the grid can fill the row */
  rate?: number;
  gstRate?: number;
  hsnCode?: string;
  uom?: string;
  phone?: string;
  gstin?: string;
}

/**
 * Miracle's signature behaviour: create a master ON THE FLY from inside an entry —
 * type an unknown party/item, hit Enter on "Create…", fill 2–3 fields, and continue
 * billing without ever leaving the voucher. Enter saves, Esc cancels.
 */
@Component({
  selector: 'wa-quick-create',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="qc-backdrop" (mousedown)="cancel.emit()">
      <div class="qc-box" (mousedown)="$event.stopPropagation()" (keydown)="onKey($event)">
        <div class="qc-title">
          ➕ New {{ kind === 'customer' ? 'Customer' : kind === 'supplier' ? 'Supplier' : 'Item' }}
          <span class="qc-hint">Enter save · Esc cancel</span>
        </div>

        <label class="qc-field">{{ kind === 'supplier' ? 'Company' : 'Name' }}
          <input data-qc="name" [(ngModel)]="name" autocomplete="off" />
        </label>

        @if (kind === 'customer') {
          <label class="qc-field">Phone (WhatsApp)
            <input data-qc="phone" [(ngModel)]="phone" placeholder="+91…" autocomplete="off" />
          </label>
        }
        @if (kind === 'supplier') {
          <label class="qc-field">Phone
            <input data-qc="phone" [(ngModel)]="phone" autocomplete="off" />
          </label>
          <label class="qc-field">GSTIN
            <input [(ngModel)]="gstin" autocomplete="off" />
          </label>
        }
        @if (kind === 'product') {
          <div class="qc-row">
            <label class="qc-field">Rate ₹
              <input data-qc="rate" type="number" [(ngModel)]="rate" />
            </label>
            <label class="qc-field">GST %
              <input type="number" [(ngModel)]="gstRate" />
            </label>
          </div>
          <div class="qc-row">
            <label class="qc-field">HSN
              <input [(ngModel)]="hsn" autocomplete="off" />
            </label>
            <label class="qc-field">UoM
              <input [(ngModel)]="uom" placeholder="pcs" autocomplete="off" />
            </label>
          </div>
        }

        @if (error()) { <p class="qc-err">{{ error() }}</p> }
        <div class="qc-actions">
          <button class="qc-save" (click)="save()" [disabled]="saving() || !valid()">
            {{ saving() ? 'Saving…' : 'Save (Enter)' }}
          </button>
          <button class="qc-cancel" (click)="cancel.emit()">Cancel (Esc)</button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .qc-backdrop {
        position: fixed; inset: 0; background: rgba(20, 40, 70, .45); z-index: 500;
        display: flex; align-items: flex-start; justify-content: center; padding-top: 14vh;
      }
      .qc-box {
        background: #fff; border: 1px solid #7da2ce; box-shadow: 4px 6px 18px rgba(0,0,0,.35);
        width: 380px; padding: 12px 14px; font-size: 13px;
      }
      .qc-title { font-weight: 700; color: #14456e; margin-bottom: 10px; display: flex; justify-content: space-between; }
      .qc-hint { font-weight: 400; font-size: 11px; color: #888; }
      .qc-field { display: block; margin-bottom: 8px; color: #333; }
      .qc-field input {
        display: block; width: 100%; margin-top: 3px; padding: 5px 8px;
        border: 1px solid #9db6d8; font-size: 13px; box-sizing: border-box;
      }
      .qc-field input:focus { outline: none; background: #fdf6d8; border-color: #d9a520; }
      .qc-row { display: flex; gap: 10px; }
      .qc-row .qc-field { flex: 1; }
      .qc-err { color: #b91c1c; font-size: 12px; margin: 4px 0; }
      .qc-actions { display: flex; gap: 8px; margin-top: 10px; }
      .qc-save { background: #1d5c8f; color: #fff; border: 0; padding: 7px 14px; cursor: pointer; }
      .qc-save:disabled { opacity: .5; }
      .qc-cancel { background: #eee; border: 1px solid #bbb; padding: 7px 14px; cursor: pointer; }
    `,
  ],
})
export class QuickCreateComponent implements OnInit {
  private readonly entry = inject(EntryService);
  private readonly host = inject(ElementRef<HTMLElement>);

  @Input({ required: true }) kind!: QuickKind;
  @Input() prefillName = '';
  @Output() created = new EventEmitter<QuickCreated>();
  @Output() cancel = new EventEmitter<void>();

  name = '';
  phone = '';
  gstin = '';
  rate: number | null = null;
  gstRate: number | null = null;
  hsn = '';
  uom = 'pcs';

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.name = this.prefillName;
    setTimeout(() => {
      const focusCell = this.kind === 'product' && this.name ? 'rate' : this.kind !== 'product' && this.name ? 'phone' : 'name';
      (this.host.nativeElement.querySelector(`[data-qc="${focusCell}"]`) as HTMLInputElement | null)?.focus();
    });
  }

  valid(): boolean {
    if (!this.name.trim()) return false;
    if (this.kind === 'customer') return this.phone.trim().length >= 8;
    if (this.kind === 'product') return (Number(this.rate) || 0) > 0;
    return true;
  }

  onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); this.save(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.cancel.emit(); }
  }

  save(): void {
    if (!this.valid() || this.saving()) return;
    // Same GSTIN rules as the Party Master (format + check digit).
    if (this.gstin.trim()) {
      this.gstin = this.gstin.trim().toUpperCase();
      const gstErr = validateGstin(this.gstin);
      if (gstErr) { this.error.set(gstErr); return; }
    }
    this.saving.set(true);
    this.error.set(null);
    const done = (payload: QuickCreated) => { this.saving.set(false); this.created.emit(payload); };
    const fail = (err: any) => { this.saving.set(false); this.error.set(err?.error?.message || 'Failed to save'); };

    if (this.kind === 'customer') {
      this.entry.createCustomer(this.name.trim(), this.phone.trim()).subscribe({
        next: (c: any) => done({ kind: 'customer', id: c.id, name: c.name || this.name.trim(), phone: c.phone }),
        error: fail,
      });
    } else if (this.kind === 'supplier') {
      this.entry.createSupplier({ company: this.name.trim(), phone: this.phone.trim() || undefined, gstin: this.gstin.trim() || undefined }).subscribe({
        next: (s: any) => done({ kind: 'supplier', id: s.id, name: s.company || this.name.trim(), gstin: s.gstin }),
        error: fail,
      });
    } else {
      this.entry.createProduct({
        name: this.name.trim(),
        basePrice: Number(this.rate) || 0,
        gstRate: this.gstRate !== null ? Number(this.gstRate) : undefined,
        hsnCode: this.hsn.trim() || undefined,
        uom: this.uom.trim() || 'pcs',
      }).subscribe({
        next: (p: any) => done({
          kind: 'product', id: p.id, name: p.name,
          rate: Number(p.salePrice ?? p.basePrice ?? this.rate) || 0,
          gstRate: Number(p.gstRate ?? this.gstRate) || 0,
          hsnCode: p.hsnCode || this.hsn || '',
          uom: p.uom || this.uom || 'pcs',
        }),
        error: fail,
      });
    }
  }
}
