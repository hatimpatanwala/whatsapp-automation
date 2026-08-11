import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  DocumentTemplateService,
  DocumentTemplate,
  DocTemplateConfig,
  DEFAULT_CONFIG,
  DOC_TYPES,
} from '../../../core/services/document-template.service';

/** Deep-clone a plain config object (no structuredClone dependency assumptions). */
function cloneConfig(c: DocTemplateConfig): DocTemplateConfig {
  return JSON.parse(JSON.stringify(c));
}

interface SampleItem { sno: number; desc: string; hsn: string; qty: number; rate: number; disc: number; tax: string; amount: number; }

/**
 * Document Template designer — a branding + layout customizer (not a free-form canvas).
 * The user picks a layout, sets logo/colours/font, chooses which header fields and item
 * columns show, edits the text blocks, and assigns the template to document types. A live
 * HTML preview mirrors what the generated PDF will look like.
 */
@Component({
  selector: 'wa-document-templates',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="dt-wrap">
    <!-- ── Sidebar: template list ─────────────────────────────── -->
    <aside class="dt-side">
      <div class="dt-side-head">
        <span>Templates</span>
        <button class="dt-btn dt-btn-sm" (click)="newTemplate()">+ New</button>
      </div>
      @for (t of templates(); track t.id) {
        <button class="dt-tpl" [class.active]="t.id === selectedId()" (click)="select(t)">
          <span class="dt-tpl-name">{{ t.name }}</span>
          @if (t.is_default) { <span class="dt-badge">default</span> }
          @if (t.applies_to?.length) { <span class="dt-tpl-sub">{{ t.applies_to.length }} doc type(s)</span> }
        </button>
      }
      @if (!templates().length && !loading()) { <p class="dt-muted">No templates yet.</p> }
    </aside>

    <!-- ── Editor ─────────────────────────────────────────────── -->
    <section class="dt-editor">
      <div class="dt-editor-head">
        <input class="dt-name" [(ngModel)]="name" placeholder="Template name" />
        <div class="dt-actions">
          <button class="dt-btn" [disabled]="saving()" (click)="save()">{{ saving() ? 'Saving…' : (isNew() ? 'Create' : 'Save') }}</button>
          @if (!isNew()) { <button class="dt-btn dt-btn-ghost" [disabled]="saving()" (click)="remove()">Delete</button> }
        </div>
      </div>
      @if (message()) { <div class="dt-msg" [class.err]="messageErr()">{{ message() }}</div> }

      <div class="dt-fields">
        <!-- Brand -->
        <div class="dt-group">
          <h4>Brand</h4>
          <label class="dt-row"><span>Layout</span>
            <select [(ngModel)]="cfg.layout">
              <option value="classic">Classic</option>
              <option value="modern">Modern</option>
              <option value="tally">Tally</option>
              <option value="compact">Compact</option>
            </select>
          </label>
          <label class="dt-row"><span>Font</span>
            <select [(ngModel)]="cfg.font">
              <option value="helvetica">Helvetica (sans)</option>
              <option value="times">Times (serif)</option>
              <option value="courier">Courier (mono)</option>
            </select>
          </label>
          <label class="dt-row"><span>Accent colour</span><input type="color" [(ngModel)]="cfg.accentColor" /></label>
          <label class="dt-row"><span>Text colour</span><input type="color" [(ngModel)]="cfg.textColor" /></label>
          <label class="dt-row"><span>Show logo</span><input type="checkbox" [(ngModel)]="cfg.showLogo" /></label>
          <div class="dt-row">
            <span>Logo</span>
            <div class="dt-logo-ctl">
              @if (cfg.logo) { <img [src]="cfg.logo" class="dt-logo-thumb" alt="logo" /> }
              <input type="file" accept="image/*" (change)="onLogo($event)" />
              @if (cfg.logo) { <button class="dt-btn dt-btn-sm dt-btn-ghost" (click)="cfg.logo = null">Remove</button> }
            </div>
          </div>
        </div>

        <!-- Header fields -->
        <div class="dt-group">
          <h4>Header fields</h4>
          <label class="dt-chk"><input type="checkbox" [(ngModel)]="cfg.header.showAddress" /> Address</label>
          <label class="dt-chk"><input type="checkbox" [(ngModel)]="cfg.header.showGstin" /> GSTIN</label>
          <label class="dt-chk"><input type="checkbox" [(ngModel)]="cfg.header.showPhone" /> Phone</label>
          <label class="dt-chk"><input type="checkbox" [(ngModel)]="cfg.header.showEmail" /> Email</label>
          <label class="dt-chk"><input type="checkbox" [(ngModel)]="cfg.header.showWebsite" /> Website</label>
        </div>

        <!-- Columns -->
        <div class="dt-group">
          <h4>Item columns</h4>
          <label class="dt-chk"><input type="checkbox" [(ngModel)]="cfg.columns.sno" /> S.No</label>
          <label class="dt-chk"><input type="checkbox" [(ngModel)]="cfg.columns.hsn" /> HSN</label>
          <label class="dt-chk"><input type="checkbox" [(ngModel)]="cfg.columns.qty" /> Qty</label>
          <label class="dt-chk"><input type="checkbox" [(ngModel)]="cfg.columns.rate" /> Rate</label>
          <label class="dt-chk"><input type="checkbox" [(ngModel)]="cfg.columns.discount" /> Discount</label>
          <label class="dt-chk"><input type="checkbox" [(ngModel)]="cfg.columns.tax" /> Tax</label>
          <label class="dt-chk"><input type="checkbox" [(ngModel)]="cfg.columns.amount" /> Amount</label>
        </div>

        <!-- Totals -->
        <div class="dt-group">
          <h4>Totals</h4>
          <label class="dt-chk"><input type="checkbox" [(ngModel)]="cfg.totals.showDiscount" /> Discount row</label>
          <label class="dt-chk"><input type="checkbox" [(ngModel)]="cfg.totals.showTaxBreakup" /> Tax row</label>
          <label class="dt-chk"><input type="checkbox" [(ngModel)]="cfg.totals.showRoundoff" /> Round off</label>
        </div>

        <!-- Text blocks -->
        <div class="dt-group dt-group-wide">
          <h4>Text blocks</h4>
          <label class="dt-ta"><span>Terms &amp; Conditions</span><textarea rows="3" [(ngModel)]="cfg.blocks.terms"></textarea></label>
          <label class="dt-ta"><span>Bank details</span><textarea rows="2" [(ngModel)]="cfg.blocks.bankDetails"></textarea></label>
          <label class="dt-ta"><span>Declaration</span><textarea rows="2" [(ngModel)]="cfg.blocks.declaration"></textarea></label>
          <label class="dt-ta"><span>Notes</span><textarea rows="2" [(ngModel)]="cfg.blocks.notes"></textarea></label>
          <label class="dt-ta"><span>Footer</span><input [(ngModel)]="cfg.blocks.footer" /></label>
          <label class="dt-ta"><span>Signature label</span><input [(ngModel)]="cfg.blocks.signatureLabel" /></label>
        </div>

        <!-- Assignment -->
        <div class="dt-group dt-group-wide">
          <h4>Apply this template to</h4>
          <p class="dt-muted">Assigning a document type here moves it off any other template.</p>
          <div class="dt-assign">
            @for (d of docTypes; track d.key) {
              <label class="dt-chk"><input type="checkbox" [checked]="appliesTo().includes(d.key)" (change)="toggleDoc(d.key, $event)" /> {{ d.label }}</label>
            }
          </div>
        </div>
      </div>
    </section>

    <!-- ── Live preview ───────────────────────────────────────── -->
    <section class="dt-preview">
      <div class="dt-preview-label">Live preview — {{ previewDocLabel() }}</div>
      <div class="dt-page" [style.color]="cfg.textColor" [style.fontFamily]="fontStack()">
        <div class="dt-p-head">
          <div class="dt-p-brand">
            @if (cfg.showLogo && cfg.logo) { <img [src]="cfg.logo" class="dt-p-logo" alt="logo" /> }
            <div>
              <div class="dt-p-biz">FIT AND FLOW TRADING</div>
              @if (cfg.header.showAddress) { <div class="dt-p-sub">Shop 5, Gulmohar Apt, Nandanvan, Nagpur-24</div> }
              <div class="dt-p-sub">
                @if (cfg.header.showGstin) { <span>GSTIN: 27ABCDE1234F1Z5&nbsp;&nbsp;</span> }
                @if (cfg.header.showPhone) { <span>Ph: 8793799871&nbsp;&nbsp;</span> }
                @if (cfg.header.showEmail) { <span>fitandflow&#64;example.com</span> }
              </div>
            </div>
          </div>
          <div class="dt-p-title" [style.color]="cfg.accentColor">{{ previewTitle() }}</div>
        </div>
        <div class="dt-p-rule" [style.background]="cfg.accentColor"></div>
        <div class="dt-p-meta">
          <div><b>No:</b> INV-1024 &nbsp; <b>Date:</b> 09/08/2026</div>
          <div><b>Bill To:</b> Acme Traders &middot; 98765 43210</div>
        </div>
        <table class="dt-p-table">
          <thead>
            <tr [style.background]="cfg.accentColor">
              @if (cfg.columns.sno) { <th>#</th> }
              <th class="l">Item</th>
              @if (cfg.columns.hsn) { <th>HSN</th> }
              @if (cfg.columns.qty) { <th>Qty</th> }
              @if (cfg.columns.rate) { <th>Rate</th> }
              @if (cfg.columns.discount) { <th>Disc</th> }
              @if (cfg.columns.tax) { <th>Tax</th> }
              @if (cfg.columns.amount) { <th>Amount</th> }
            </tr>
          </thead>
          <tbody>
            @for (it of sampleItems; track it.sno) {
              <tr>
                @if (cfg.columns.sno) { <td>{{ it.sno }}</td> }
                <td class="l">{{ it.desc }}</td>
                @if (cfg.columns.hsn) { <td>{{ it.hsn }}</td> }
                @if (cfg.columns.qty) { <td>{{ it.qty }}</td> }
                @if (cfg.columns.rate) { <td>{{ it.rate.toFixed(2) }}</td> }
                @if (cfg.columns.discount) { <td>{{ it.disc.toFixed(2) }}</td> }
                @if (cfg.columns.tax) { <td>{{ it.tax }}</td> }
                @if (cfg.columns.amount) { <td>{{ it.amount.toFixed(2) }}</td> }
              </tr>
            }
          </tbody>
        </table>
        <div class="dt-p-totals">
          <div><span>Subtotal</span><span>Rs. 1050.00</span></div>
          @if (cfg.totals.showDiscount) { <div><span>Discount</span><span>- Rs. 0.00</span></div> }
          @if (cfg.totals.showTaxBreakup) { <div><span>Tax</span><span>Rs. 189.00</span></div> }
          @if (cfg.totals.showRoundoff) { <div><span>Round Off</span><span>+ Rs. 0.00</span></div> }
          <div class="tot" [style.color]="cfg.accentColor"><span>Total</span><span>Rs. 1239.00</span></div>
        </div>
        <div class="dt-p-blocks">
          @if (cfg.blocks.notes) { <div><b [style.color]="cfg.accentColor">Notes</b><p>{{ cfg.blocks.notes }}</p></div> }
          @if (cfg.blocks.bankDetails) { <div><b [style.color]="cfg.accentColor">Bank Details</b><p>{{ cfg.blocks.bankDetails }}</p></div> }
          @if (cfg.blocks.terms) { <div><b [style.color]="cfg.accentColor">Terms &amp; Conditions</b><p>{{ cfg.blocks.terms }}</p></div> }
          @if (cfg.blocks.declaration) { <div><b [style.color]="cfg.accentColor">Declaration</b><p>{{ cfg.blocks.declaration }}</p></div> }
          @if (cfg.blocks.signatureLabel) { <div class="sig"><span class="line"></span>{{ cfg.blocks.signatureLabel }}</div> }
        </div>
        @if (cfg.blocks.footer) { <div class="dt-p-footer">{{ cfg.blocks.footer }}</div> }
      </div>
    </section>
  </div>
  `,
  styles: [`
    .dt-wrap { display: grid; grid-template-columns: 210px 380px 1fr; gap: 16px; padding: 16px; height: calc(100dvh - 60px); box-sizing: border-box; }
    .dt-side { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px; overflow: auto; background: #fff; }
    .dt-side-head { display: flex; justify-content: space-between; align-items: center; font-weight: 700; margin-bottom: 8px; }
    .dt-tpl { display: flex; flex-direction: column; align-items: flex-start; width: 100%; text-align: left; border: 1px solid #e5e7eb; background: #fff; border-radius: 8px; padding: 8px; margin-bottom: 6px; cursor: pointer; }
    .dt-tpl.active { border-color: #2563eb; background: #eff6ff; }
    .dt-tpl-name { font-weight: 600; font-size: 13px; }
    .dt-tpl-sub { font-size: 11px; color: #6b7280; }
    .dt-badge { font-size: 10px; background: #dcfce7; color: #166534; padding: 1px 6px; border-radius: 999px; }
    .dt-editor { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; overflow: auto; background: #fff; }
    .dt-editor-head { display: flex; gap: 8px; margin-bottom: 10px; }
    .dt-name { flex: 1; padding: 8px; border: 1px solid #d1d5db; border-radius: 8px; font-weight: 600; }
    .dt-actions { display: flex; gap: 6px; }
    .dt-btn { border: 0; background: #2563eb; color: #fff; border-radius: 8px; padding: 8px 12px; font-weight: 600; cursor: pointer; }
    .dt-btn:disabled { opacity: .6; cursor: default; }
    .dt-btn-ghost { background: #f3f4f6; color: #374151; }
    .dt-btn-sm { padding: 4px 8px; font-size: 12px; }
    .dt-msg { background: #ecfdf5; color: #065f46; border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; font-size: 13px; }
    .dt-msg.err { background: #fef2f2; color: #991b1b; }
    .dt-group { border-top: 1px solid #f0f0f0; padding: 10px 0; }
    .dt-group h4 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; }
    .dt-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; font-size: 13px; }
    .dt-row select, .dt-row input[type=color] { min-width: 130px; }
    .dt-row select { padding: 5px; border: 1px solid #d1d5db; border-radius: 6px; }
    .dt-chk { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; margin: 0 12px 6px 0; }
    .dt-logo-ctl { display: flex; align-items: center; gap: 8px; }
    .dt-logo-thumb { height: 28px; border: 1px solid #e5e7eb; border-radius: 4px; }
    .dt-ta { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; font-size: 12px; color: #374151; }
    .dt-ta textarea, .dt-ta input { border: 1px solid #d1d5db; border-radius: 6px; padding: 6px; font: inherit; font-size: 12px; }
    .dt-assign { display: flex; flex-wrap: wrap; }
    .dt-muted { color: #9ca3af; font-size: 12px; }

    /* Preview */
    .dt-preview { overflow: auto; }
    .dt-preview-label { font-size: 12px; color: #6b7280; margin-bottom: 8px; }
    .dt-page { background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; box-shadow: 0 4px 20px rgba(0,0,0,.06); padding: 28px; max-width: 640px; font-size: 12px; }
    .dt-p-head { display: flex; justify-content: space-between; align-items: flex-start; }
    .dt-p-brand { display: flex; gap: 12px; }
    .dt-p-logo { height: 52px; }
    .dt-p-biz { font-size: 17px; font-weight: 700; }
    .dt-p-sub { color: #555; font-size: 11px; margin-top: 2px; }
    .dt-p-title { font-size: 22px; font-weight: 700; text-align: right; }
    .dt-p-rule { height: 2px; margin: 12px 0; }
    .dt-p-meta { display: flex; justify-content: space-between; font-size: 11px; color: #333; margin-bottom: 12px; }
    .dt-p-table { width: 100%; border-collapse: collapse; }
    .dt-p-table th { color: #fff; font-size: 11px; padding: 5px 6px; text-align: right; }
    .dt-p-table th.l, .dt-p-table td.l { text-align: left; }
    .dt-p-table td { padding: 5px 6px; text-align: right; border-bottom: 1px solid #f0f0f0; font-size: 11px; }
    .dt-p-totals { margin: 10px 0 0 auto; width: 220px; }
    .dt-p-totals > div { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; }
    .dt-p-totals .tot { font-weight: 700; font-size: 13px; border-top: 1px solid #ddd; margin-top: 4px; padding-top: 4px; }
    .dt-p-blocks { margin-top: 16px; font-size: 10.5px; color: #333; }
    .dt-p-blocks b { display: block; font-size: 10px; margin-top: 8px; }
    .dt-p-blocks p { margin: 2px 0; white-space: pre-line; }
    .dt-p-blocks .sig { margin-top: 26px; text-align: right; }
    .dt-p-blocks .sig .line { display: block; width: 160px; margin-left: auto; border-top: 1px solid #bbb; margin-bottom: 4px; }
    .dt-p-footer { text-align: center; color: #999; font-size: 10px; margin-top: 14px; }

    @media (max-width: 1100px) { .dt-wrap { grid-template-columns: 1fr; height: auto; } }
  `],
})
export class DocumentTemplatesComponent {
  private readonly svc = inject(DocumentTemplateService);
  readonly docTypes = DOC_TYPES;

  readonly templates = signal<DocumentTemplate[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly message = signal<string | null>(null);
  readonly messageErr = signal(false);
  readonly appliesTo = signal<string[]>([]);

  // Working copies bound to the form (mutated by ngModel → preview updates live).
  name = 'New template';
  cfg: DocTemplateConfig = cloneConfig(DEFAULT_CONFIG);

  readonly sampleItems: SampleItem[] = [
    { sno: 1, desc: 'ABRO AB-80 Spray 100ml', hsn: '3405', qty: 5, rate: 120, disc: 0, tax: '18%', amount: 600 },
    { sno: 2, desc: 'ABRO Masking Tape 24mm x 20m', hsn: '3919', qty: 10, rate: 45, disc: 0, tax: '18%', amount: 450 },
  ];

  readonly isNew = computed(() => this.selectedId() === null);
  readonly fontStack = computed(() => {
    switch (this.cfg.font) {
      case 'times': return 'Georgia, "Times New Roman", serif';
      case 'courier': return '"Courier New", monospace';
      default: return 'Arial, Helvetica, sans-serif';
    }
  });
  previewTitle(): string {
    const first = this.appliesTo()[0];
    const d = DOC_TYPES.find((x) => x.key === first);
    return (d?.label || 'Tax Invoice').toUpperCase();
  }
  previewDocLabel(): string {
    const first = this.appliesTo()[0];
    return DOC_TYPES.find((x) => x.key === first)?.label || 'Tax Invoice';
  }

  constructor() {
    this.reload();
  }

  reload(select?: string): void {
    this.loading.set(true);
    this.svc.list().subscribe({
      next: (list) => {
        this.templates.set(list || []);
        this.loading.set(false);
        const pick = (select && list.find((t) => t.id === select)) || list[0];
        if (pick) this.select(pick);
      },
      error: () => { this.loading.set(false); this.flash('Could not load templates.', true); },
    });
  }

  select(t: DocumentTemplate): void {
    this.selectedId.set(t.id);
    this.name = t.name;
    // Merge stored config over defaults so older/partial configs stay complete.
    this.cfg = cloneConfig({ ...DEFAULT_CONFIG, ...(t.config || {}),
      header: { ...DEFAULT_CONFIG.header, ...(t.config?.header || {}) },
      columns: { ...DEFAULT_CONFIG.columns, ...(t.config?.columns || {}) },
      totals: { ...DEFAULT_CONFIG.totals, ...(t.config?.totals || {}) },
      blocks: { ...DEFAULT_CONFIG.blocks, ...(t.config?.blocks || {}) } });
    this.appliesTo.set([...(t.applies_to || [])]);
  }

  newTemplate(): void {
    this.selectedId.set(null);
    this.name = 'New template';
    this.cfg = cloneConfig(DEFAULT_CONFIG);
    this.appliesTo.set([]);
  }

  toggleDoc(key: string, ev: Event): void {
    const on = (ev.target as HTMLInputElement).checked;
    this.appliesTo.update((a) => (on ? [...new Set([...a, key])] : a.filter((k) => k !== key)));
  }

  onLogo(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 400 * 1024) { this.flash('Logo must be under 400 KB.', true); return; }
    const reader = new FileReader();
    reader.onload = () => { this.cfg.logo = String(reader.result); };
    reader.readAsDataURL(file);
  }

  save(): void {
    if (!this.name.trim()) { this.flash('Please enter a template name.', true); return; }
    this.saving.set(true);
    const done = (t: DocumentTemplate) => {
      // Persist the doc-type assignment, then reload with this template selected.
      this.svc.assign(t.id, this.appliesTo()).subscribe({
        next: () => { this.saving.set(false); this.flash('Saved.'); this.reload(t.id); },
        error: () => { this.saving.set(false); this.flash('Saved, but assignment failed.', true); this.reload(t.id); },
      });
    };
    if (this.isNew()) {
      this.svc.create({ name: this.name.trim(), config: this.cfg, appliesTo: this.appliesTo() }).subscribe({
        next: done, error: () => { this.saving.set(false); this.flash('Could not create template.', true); },
      });
    } else {
      this.svc.update(this.selectedId()!, { name: this.name.trim(), config: this.cfg }).subscribe({
        next: done, error: () => { this.saving.set(false); this.flash('Could not save template.', true); },
      });
    }
  }

  remove(): void {
    const id = this.selectedId();
    if (!id) return;
    this.saving.set(true);
    this.svc.remove(id).subscribe({
      next: () => { this.saving.set(false); this.flash('Template deleted.'); this.newTemplate(); this.reload(); },
      error: () => { this.saving.set(false); this.flash('Could not delete template.', true); },
    });
  }

  private flash(msg: string, err = false): void {
    this.message.set(msg);
    this.messageErr.set(err);
    setTimeout(() => this.message.set(null), 4000);
  }
}
