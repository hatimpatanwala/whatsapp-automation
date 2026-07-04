import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EntryService } from '../../core/services/entry.service';

/** GST states (code → name) — drives the state picker and GSTIN cross-check. */
const GST_STATES: Array<[string, string]> = [
  ['01', 'Jammu & Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'],
  ['05', 'Uttarakhand'], ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'],
  ['09', 'Uttar Pradesh'], ['10', 'Bihar'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'],
  ['13', 'Nagaland'], ['14', 'Manipur'], ['15', 'Mizoram'], ['16', 'Tripura'],
  ['17', 'Meghalaya'], ['18', 'Assam'], ['19', 'West Bengal'], ['20', 'Jharkhand'],
  ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'],
  ['26', 'Dadra & Nagar Haveli and Daman & Diu'], ['27', 'Maharashtra'], ['29', 'Karnataka'],
  ['30', 'Goa'], ['31', 'Lakshadweep'], ['32', 'Kerala'], ['33', 'Tamil Nadu'],
  ['34', 'Puducherry'], ['35', 'Andaman & Nicobar'], ['36', 'Telangana'], ['37', 'Andhra Pradesh'],
  ['38', 'Ladakh'], ['97', 'Other Territory'],
];

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

function gstinChecksumOk(g: string): boolean {
  const val = (c: string) => (c >= '0' && c <= '9' ? c.charCodeAt(0) - 48 : c.charCodeAt(0) - 55);
  const chr = (v: number) => (v < 10 ? String.fromCharCode(48 + v) : String.fromCharCode(55 + v));
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = val(g[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return chr((36 - (sum % 36)) % 36) === g[14];
}

interface ShipAddr { id?: string; label?: string; fullAddress: string; city?: string; state?: string; pincode?: string; isDefault?: boolean; }

/**
 * Party Master — the GST ledger-party (PARTY_MASTER_README.md): ONE screen for
 * sale + purchase parties; the account group (Sundry Debtor / Sundry Creditor)
 * decides the role. gst_registration_type is the master switch — GST fields show
 * and become required only for Regular/Composition/SEZ (progressive disclosure).
 * Live validation mirrors the backend (GSTIN format + checksum + state cross-check,
 * PAN from GSTIN, IFSC), duplicate GSTIN warns without blocking, shipping addresses
 * are a repeatable child list, and saving builds/updates the party ledger with its
 * opening balance.
 */
@Component({
  selector: 'wa-party-master',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="p-3 md:p-5 select-none">
      <span class="hidden">{{ tick() }}</span>
      <div class="flex items-center gap-4 mb-3 border-b pb-2 flex-wrap">
        <h1 class="text-lg font-semibold">Party Master</h1>
        <span class="text-xs text-slate-500">one party = one ledger · account group decides sale/purchase</span>
        @if (saved()) { <span class="text-sm px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">✓ {{ saved() }}</span> }
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <!-- Browser -->
        <div class="lg:col-span-2 border rounded-lg overflow-hidden">
          <div class="flex gap-2 p-2 bg-slate-50 border-b items-center">
            <input data-autofocus [(ngModel)]="query" (ngModelChange)="reload()"
                   class="flex-1 border rounded px-2 py-1.5 text-sm focus:bg-amber-50 focus:outline-none"
                   placeholder="Search name / alias / GSTIN / mobile…" autocomplete="off" />
            <select [(ngModel)]="filterGroup" (ngModelChange)="reload()" class="border rounded px-1 py-1.5 text-xs">
              <option value="">All</option><option value="debtor">Debtors</option><option value="creditor">Creditors</option>
            </select>
            <button (click)="startNew()" class="px-3 py-1.5 rounded bg-slate-800 text-white text-sm whitespace-nowrap">＋ New</button>
          </div>
          <table class="w-full text-sm">
            <thead><tr class="bg-slate-100 text-slate-600 text-xs">
              <th class="px-2 py-1 text-left">Party</th><th class="px-2 py-1 text-left w-20">Group</th>
              <th class="px-2 py-1 text-left w-32">GSTIN</th><th class="px-2 py-1 w-12"></th>
            </tr></thead>
            <tbody>
              @for (p of list(); track p.id) {
                <tr (click)="pick(p)" class="cursor-pointer border-t border-slate-100 hover:bg-amber-50"
                    [class.bg-amber-100]="editId() === p.id" [class.opacity-50]="p.isActive === false">
                  <td class="px-2 py-1">{{ p.partyName }} @if (p.alias) { <span class="text-xs text-slate-400">({{ p.alias }})</span> }</td>
                  <td class="px-2 py-1 text-xs">{{ p.accountGroup === 'creditor' ? 'Creditor' : 'Debtor' }}</td>
                  <td class="px-2 py-1 text-xs font-mono">{{ p.gstin || '—' }}</td>
                  <td class="px-2 py-1 text-xs">{{ p.isActive === false ? 'off' : '' }}</td>
                </tr>
              } @empty { <tr><td colspan="4" class="px-2 py-4 text-center text-slate-400 text-sm">No parties found.</td></tr> }
            </tbody>
          </table>
        </div>

        <!-- Form -->
        <div class="lg:col-span-3 border rounded-lg p-4 text-sm">
          <div class="flex items-center gap-4 mb-3">
            <h2 class="font-semibold">{{ editId() ? 'Edit Party' : 'New Party' }}</h2>
            <div class="flex rounded overflow-hidden border text-xs">
              <button (click)="group = 'debtor'" [disabled]="!!editId()" class="px-3 py-1"
                      [class.bg-slate-800]="group === 'debtor'" [class.text-white]="group === 'debtor'">Sundry Debtor (sale)</button>
              <button (click)="group = 'creditor'" [disabled]="!!editId()" class="px-3 py-1"
                      [class.bg-slate-800]="group === 'creditor'" [class.text-white]="group === 'creditor'">Sundry Creditor (purchase)</button>
            </div>
            @if (editId()) {
              <button (click)="softDelete()" class="ml-auto text-xs text-red-700 hover:underline">Deactivate (soft delete)</button>
            }
          </div>

          <!-- Identity -->
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
            <label class="col-span-2">Party name *
              <input [(ngModel)]="f.partyName" class="mt-1 w-full border rounded px-2 py-1.5 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
              @if (errors()['partyName']) { <p class="err">{{ errors()['partyName'] }}</p> }
            </label>
            <label>Alias / short name
              <input [(ngModel)]="f.alias" class="mt-1 w-full border rounded px-2 py-1.5" autocomplete="off" />
            </label>
            <label>Party code
              <input [(ngModel)]="f.partyCode" class="mt-1 w-full border rounded px-2 py-1.5" autocomplete="off" />
            </label>
            <label>GST registration type *
              <select [(ngModel)]="f.gstRegistrationType" (ngModelChange)="revalidate()" class="mt-1 w-full border rounded px-2 py-1.5">
                <option value="regular">Regular</option><option value="composition">Composition</option>
                <option value="unregistered">Unregistered</option><option value="consumer">Consumer (walk-in)</option>
                <option value="sez">SEZ</option><option value="overseas">Overseas</option>
              </select>
            </label>
            <label class="flex items-end gap-2 pb-1">
              <input type="checkbox" [(ngModel)]="f.isActive" /> Active
            </label>
          </div>

          <!-- GST & statutory (progressive disclosure) -->
          @if (gstVisible()) {
            <div class="border rounded p-3 mb-3 bg-slate-50">
              <div class="text-xs font-semibold text-slate-500 uppercase mb-2">GST &amp; statutory</div>
              <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                <label>GSTIN {{ gstinRequired() ? '*' : '' }}
                  <div class="flex gap-1 mt-1">
                    <input [(ngModel)]="f.gstin" (ngModelChange)="onGstin()" maxlength="15"
                           class="w-full border rounded px-2 py-1.5 font-mono uppercase" autocomplete="off" />
                    <button (click)="fetchGstin()" [disabled]="fetching()" title="Fetch party details from the GST number"
                            class="px-2 rounded bg-indigo-700 text-white text-xs whitespace-nowrap disabled:opacity-50">
                      {{ fetching() ? '…' : '⇩ Fetch' }}
                    </button>
                  </div>
                  @if (errors()['gstin']) { <p class="err">{{ errors()['gstin'] }}</p> }
                  @if (dupWarn()) { <p class="warn">⚠ GSTIN already on: {{ dupWarn() }}</p> }
                  @if (fetchNote()) { <p class="warn">{{ fetchNote() }}</p> }
                  @if (fetchOk()) { <p class="ok">✓ {{ fetchOk() }}</p> }
                </label>
                <label>PAN
                  <input [(ngModel)]="f.pan" maxlength="10" (ngModelChange)="revalidate()"
                         class="mt-1 w-full border rounded px-2 py-1.5 font-mono uppercase" autocomplete="off" />
                  @if (errors()['pan']) { <p class="err">{{ errors()['pan'] }}</p> }
                </label>
                <label>State {{ gstinRequired() ? '*' : '' }}
                  <select [(ngModel)]="f.stateCode" (ngModelChange)="onState()" class="mt-1 w-full border rounded px-2 py-1.5">
                    <option value="">—</option>
                    @for (s of states; track s[0]) { <option [value]="s[0]">{{ s[0] }} · {{ s[1] }}</option> }
                  </select>
                  @if (errors()['stateCode']) { <p class="err">{{ errors()['stateCode'] }}</p> }
                </label>
                <label>Place of supply
                  <input [(ngModel)]="f.placeOfSupply" placeholder="defaults from state" class="mt-1 w-full border rounded px-2 py-1.5" autocomplete="off" />
                </label>
                <label class="flex items-end gap-2 pb-1"><input type="checkbox" [(ngModel)]="f.reverseCharge" /> Reverse charge (RCM)</label>
                <label class="flex items-end gap-2 pb-1"><input type="checkbox" [(ngModel)]="f.tdsApplicable" /> TDS applicable
                  @if (f.tdsApplicable) { <input [(ngModel)]="f.tdsSection" placeholder="194Q" class="border rounded px-2 py-1 w-20 ml-1" autocomplete="off" /> }
                </label>
              </div>
            </div>
          } @else {
            <p class="text-xs text-slate-400 mb-3">GST fields hidden — {{ f.gstRegistrationType }} parties carry no GSTIN. State
              <select [(ngModel)]="f.stateCode" (ngModelChange)="onState()" class="border rounded px-1 py-0.5 text-xs ml-1">
                <option value="">—</option>
                @for (s of states; track s[0]) { <option [value]="s[0]">{{ s[1] }}</option> }
              </select>
            </p>
          }

          <!-- Address + contact -->
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
            <label class="col-span-2">Billing address
              <textarea [(ngModel)]="f.billingAddress" rows="2" class="mt-1 w-full border rounded px-2 py-1.5"></textarea>
            </label>
            <label>PIN code
              <input [(ngModel)]="f.pincode" class="mt-1 w-full border rounded px-2 py-1.5" autocomplete="off" />
            </label>
            <label>Contact person
              <input [(ngModel)]="f.contactPerson" class="mt-1 w-full border rounded px-2 py-1.5" autocomplete="off" />
            </label>
            <label>Mobile (WhatsApp)
              <input [(ngModel)]="f.mobile" (ngModelChange)="revalidate()" class="mt-1 w-full border rounded px-2 py-1.5" autocomplete="off" />
              @if (errors()['mobile']) { <p class="err">{{ errors()['mobile'] }}</p> }
            </label>
            <label>Email
              <input [(ngModel)]="f.email" (ngModelChange)="revalidate()" class="mt-1 w-full border rounded px-2 py-1.5" autocomplete="off" />
              @if (errors()['email']) { <p class="err">{{ errors()['email'] }}</p> }
            </label>
          </div>

          <!-- Financial / pricing -->
          <div class="border rounded p-3 mb-3">
            <div class="text-xs font-semibold text-slate-500 uppercase mb-2">Financial &amp; pricing</div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
              <label>Opening balance ₹
                <div class="flex gap-1 mt-1">
                  <input type="number" [(ngModel)]="f.openingBalance" (ngModelChange)="revalidate()" class="w-full border rounded px-2 py-1.5 text-right" />
                  <select [(ngModel)]="f.openingDrCr" class="border rounded px-1"><option value="DR">Dr</option><option value="CR">Cr</option></select>
                </div>
                @if (errors()['openingDrCr']) { <p class="err">{{ errors()['openingDrCr'] }}</p> }
              </label>
              <label>Credit limit ₹
                <input type="number" [(ngModel)]="f.creditLimit" (ngModelChange)="revalidate()" class="mt-1 w-full border rounded px-2 py-1.5 text-right" />
                @if (errors()['creditLimit']) { <p class="err">{{ errors()['creditLimit'] }}</p> }
              </label>
              <label>Credit days
                <input type="number" [(ngModel)]="f.creditDays" class="mt-1 w-full border rounded px-2 py-1.5 text-right" />
              </label>
              <label>Default discount %
                <input type="number" [(ngModel)]="f.defaultDiscountPct" class="mt-1 w-full border rounded px-2 py-1.5 text-right" />
              </label>
              <label class="flex items-end gap-2 pb-1 col-span-2">
                <input type="checkbox" [(ngModel)]="f.billByBill" /> Bill-by-bill outstanding tracking
              </label>
            </div>
          </div>

          <!-- Banking + classification -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <label>Bank name <input [(ngModel)]="f.bankName" class="mt-1 w-full border rounded px-2 py-1.5" autocomplete="off" /></label>
            <label>Account no. <input [(ngModel)]="f.accountNumber" class="mt-1 w-full border rounded px-2 py-1.5 font-mono" autocomplete="off" /></label>
            <label>IFSC
              <input [(ngModel)]="f.ifsc" (ngModelChange)="revalidate()" maxlength="11" class="mt-1 w-full border rounded px-2 py-1.5 font-mono uppercase" autocomplete="off" />
              @if (errors()['ifsc']) { <p class="err">{{ errors()['ifsc'] }}</p> }
            </label>
            <label>UPI id <input [(ngModel)]="f.upiId" class="mt-1 w-full border rounded px-2 py-1.5" autocomplete="off" /></label>
            <label>Salesman <input [(ngModel)]="f.salesman" class="mt-1 w-full border rounded px-2 py-1.5" autocomplete="off" /></label>
            <label>Route <input [(ngModel)]="f.route" class="mt-1 w-full border rounded px-2 py-1.5" autocomplete="off" /></label>
            <label>Area / zone <input [(ngModel)]="f.area" class="mt-1 w-full border rounded px-2 py-1.5" autocomplete="off" /></label>
            <label>Tags (comma) <input [(ngModel)]="tagsText" class="mt-1 w-full border rounded px-2 py-1.5" autocomplete="off" /></label>
          </div>

          <!-- Shipping addresses (debtors) -->
          @if (group === 'debtor' && editId()) {
            <div class="border rounded p-3 mb-3">
              <div class="text-xs font-semibold text-slate-500 uppercase mb-2">Shipping addresses (1 → many)</div>
              @for (a of shipAddrs(); track a.id) {
                <div class="flex items-center gap-2 text-xs border-b border-slate-100 py-1">
                  <span class="font-medium">{{ a.label || 'addr' }}</span>
                  <span class="text-slate-500 truncate flex-1">{{ a.fullAddress }} {{ a.city }} {{ a.pincode }}</span>
                  @if (a.isDefault) { <span class="text-emerald-700">default</span> }
                  <button (click)="removeAddr(a)" class="text-red-600 hover:underline">remove</button>
                </div>
              } @empty { <p class="text-xs text-slate-400">No ship-to addresses yet.</p> }
              <div class="flex gap-2 mt-2 text-xs flex-wrap">
                <input [(ngModel)]="newAddr.label" placeholder="Label" class="border rounded px-2 py-1 w-20" autocomplete="off" />
                <input [(ngModel)]="newAddr.fullAddress" placeholder="Address *" class="border rounded px-2 py-1 flex-1 min-w-40" autocomplete="off" />
                <input [(ngModel)]="newAddr.city" placeholder="City" class="border rounded px-2 py-1 w-24" autocomplete="off" />
                <input [(ngModel)]="newAddr.pincode" placeholder="PIN" class="border rounded px-2 py-1 w-20" autocomplete="off" />
                <label class="flex items-center gap-1"><input type="checkbox" [(ngModel)]="newAddr.isDefault" /> default</label>
                <button (click)="addAddr()" [disabled]="!newAddr.fullAddress?.trim()" class="px-2 py-1 rounded bg-slate-800 text-white disabled:opacity-40">Add</button>
              </div>
            </div>
          }

          <div class="flex items-center gap-3">
            <button (click)="save()" [disabled]="saving() || !canSave()"
                    class="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-50">
              {{ saving() ? 'Saving…' : (editId() ? 'Save Changes (Ctrl+A)' : 'Create Party (Ctrl+A)') }}
            </button>
            @if (!canSave() && f.partyName) { <span class="text-xs text-amber-600">fix the highlighted fields to save</span> }
            @if (apiError()) { <span class="text-red-600 text-xs">{{ apiError() }}</span> }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      label { display: block; color: #334; font-size: 12.5px; }
      .err { color: #b91c1c; font-size: 11px; margin-top: 2px; }
      .warn { color: #92600a; font-size: 11px; margin-top: 2px; }
      .ok { color: #1d7a4f; font-size: 11px; margin-top: 2px; }
    `,
  ],
})
export class PartyMasterComponent {
  private readonly entry = inject(EntryService);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly tick = signal(0);
  readonly list = signal<any[]>([]);
  readonly editId = signal<string | null>(null);
  readonly errors = signal<Record<string, string>>({});
  readonly dupWarn = signal<string | null>(null);
  readonly shipAddrs = signal<ShipAddr[]>([]);
  readonly saving = signal(false);
  readonly saved = signal<string | null>(null);
  readonly apiError = signal<string | null>(null);

  readonly states = GST_STATES;
  query = '';
  filterGroup = '';
  group: 'debtor' | 'creditor' = 'debtor';
  tagsText = '';
  newAddr: ShipAddr = { fullAddress: '' };

  f: any = this.blank();
  private debounce?: ReturnType<typeof setTimeout>;
  private gstinDebounce?: ReturnType<typeof setTimeout>;

  constructor() { this.reload(true); }

  private blank(): any {
    return {
      partyName: '', alias: '', partyCode: '', gstRegistrationType: 'regular', gstin: '', pan: '',
      stateCode: '', state: '', placeOfSupply: '', reverseCharge: false, tdsApplicable: false, tdsSection: '',
      billingAddress: '', pincode: '', contactPerson: '', mobile: '', email: '',
      openingBalance: null, openingDrCr: 'DR', creditLimit: null, creditDays: null, billByBill: true,
      defaultDiscountPct: null, bankName: '', accountNumber: '', ifsc: '', upiId: '',
      salesman: '', route: '', area: '', isActive: true,
    };
  }

  reload(now = false): void {
    clearTimeout(this.debounce);
    const run = () => this.entry.parties(this.query.trim(), (this.filterGroup || undefined) as any)
      .subscribe((rows) => this.list.set(rows || []));
    if (now) run(); else this.debounce = setTimeout(run, 200);
  }

  gstVisible(): boolean { return !['consumer', 'unregistered'].includes(this.f.gstRegistrationType); }
  gstinRequired(): boolean { return ['regular', 'composition', 'sez'].includes(this.f.gstRegistrationType); }

  onGstin(): void {
    this.f.gstin = (this.f.gstin || '').toUpperCase();
    const g = this.f.gstin;
    if (GSTIN_RE.test(g)) {
      // Auto-derive state + PAN from a valid GSTIN (spec §2.2 / §4).
      this.f.stateCode = g.slice(0, 2);
      if (!this.f.pan) this.f.pan = g.slice(2, 12);
      this.onState();
      clearTimeout(this.gstinDebounce);
      this.gstinDebounce = setTimeout(() => {
        this.entry.checkGstin(g, this.editId() || undefined).subscribe((r) => {
          this.dupWarn.set(r?.exists ? (r.parties || []).join(', ') : null);
        });
        // Auto-fetch the party's details the moment a checksum-valid GSTIN lands.
        if (gstinChecksumOk(g)) this.fetchGstin();
      }, 400);
    } else { this.dupWarn.set(null); this.fetchOk.set(null); this.fetchNote.set(null); }
    this.revalidate();
  }

  // ─── GSTIN auto-fetch ───────────────────────────────────────────────────────
  readonly fetching = signal(false);
  readonly fetchOk = signal<string | null>(null);
  readonly fetchNote = signal<string | null>(null);

  fetchGstin(): void {
    const g = (this.f.gstin || '').toUpperCase();
    if (!GSTIN_RE.test(g) || !gstinChecksumOk(g) || this.fetching()) return;
    this.fetching.set(true);
    this.fetchOk.set(null);
    this.fetchNote.set(null);
    this.entry.gstinLookup(g).subscribe({
      next: (d: any) => {
        this.fetching.set(false);
        if (!d) return;
        // Fill blanks only — never stomp what the operator already typed.
        if (d.legalName && !this.f.partyName?.trim()) this.f.partyName = d.legalName;
        if (d.tradeName && !this.f.alias?.trim()) this.f.alias = d.tradeName;
        if (d.address && !this.f.billingAddress?.trim()) this.f.billingAddress = d.address;
        if (d.pincode && !this.f.pincode?.trim()) this.f.pincode = d.pincode;
        if (d.pan && !this.f.pan?.trim()) this.f.pan = d.pan;
        if (d.stateCode) { this.f.stateCode = d.stateCode; this.onState(); }
        if (d.registrationType) this.f.gstRegistrationType = d.registrationType;
        if (d.source === 'gst-portal') {
          this.fetchOk.set(`Fetched from GST records${d.legalName ? ': ' + d.legalName : ''}${d.status ? ' (' + d.status + ')' : ''}`);
        } else {
          this.fetchOk.set(`Derived from GSTIN: ${[d.state, d.entityType].filter(Boolean).join(' · ')}`);
          if (d.note) this.fetchNote.set(d.note);
        }
        this.revalidate();
        this.tick.update((t) => t + 1);
      },
      error: (err) => {
        this.fetching.set(false);
        this.fetchNote.set(err?.error?.error?.errors?.gstin || err?.error?.message || 'Lookup failed');
      },
    });
  }

  onState(): void {
    const hit = GST_STATES.find((s) => s[0] === this.f.stateCode);
    if (hit) {
      this.f.state = hit[1];
      if (!this.f.placeOfSupply) this.f.placeOfSupply = hit[1];
    }
    this.revalidate();
  }

  /** Event handlers call this to refresh the inline messages. */
  revalidate(): void {
    this.errors.set(this.computeErrors());
  }

  /** Client-side mirror of the backend rules — PURE (no signal writes): safe in templates. */
  private computeErrors(): Record<string, string> {
    const e: Record<string, string> = {};
    const f = this.f;
    const gstin = (f.gstin || '').trim().toUpperCase();
    if (!f.partyName?.trim()) e['partyName'] = 'Party name is required';
    if (this.gstinRequired() && !gstin) e['gstin'] = `GSTIN is required for ${f.gstRegistrationType} parties`;
    if (['consumer', 'unregistered'].includes(f.gstRegistrationType) && gstin) e['gstin'] = `${f.gstRegistrationType} parties must not have a GSTIN`;
    if (gstin) {
      if (!GSTIN_RE.test(gstin)) e['gstin'] = 'GSTIN format is invalid (15 chars)';
      else if (!gstinChecksumOk(gstin)) e['gstin'] = 'GSTIN check digit is wrong — please re-check';
      else if (f.stateCode && gstin.slice(0, 2) !== String(f.stateCode).padStart(2, '0')) e['stateCode'] = `State does not match GSTIN state ${gstin.slice(0, 2)}`;
    }
    if (this.gstinRequired() && !f.stateCode && !gstin) e['stateCode'] = 'State is required for GST-registered parties';
    const pan = (f.pan || '').trim().toUpperCase();
    if (pan) {
      if (!PAN_RE.test(pan)) e['pan'] = 'PAN format is invalid';
      else if (gstin && GSTIN_RE.test(gstin) && gstin.slice(2, 12) !== pan) e['pan'] = `PAN must match GSTIN chars 3–12 (${gstin.slice(2, 12)})`;
    }
    if (f.ifsc && !IFSC_RE.test(String(f.ifsc).trim().toUpperCase())) e['ifsc'] = 'IFSC format is invalid';
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e['email'] = 'Email looks invalid';
    if (f.mobile && !/^\d{10}$/.test(String(f.mobile).replace(/^\+91/, '').replace(/\D/g, '').slice(-10))) e['mobile'] = 'Mobile must be 10 digits';
    if (f.creditLimit !== null && f.creditLimit !== undefined && Number(f.creditLimit) < 0) e['creditLimit'] = 'Credit limit cannot be negative';
    if (f.openingBalance && !f.openingDrCr) e['openingDrCr'] = 'Choose Dr or Cr';
    return e;
  }

  canSave(): boolean {
    return Object.keys(this.computeErrors()).length === 0 && !!this.f.partyName?.trim();
  }

  pick(p: any): void {
    this.entry.party(p.accountGroup, p.id).subscribe((full) => {
      this.editId.set(p.id);
      this.group = p.accountGroup;
      this.f = {
        ...this.blank(),
        partyName: full.partyName || full.name || full.company || '',
        alias: full.alias || '', partyCode: full.partyCode || '',
        gstRegistrationType: full.gstRegistrationType || 'consumer',
        gstin: full.gstin || '', pan: full.pan || '',
        stateCode: full.stateCode || '', state: full.state || '', placeOfSupply: full.placeOfSupply || '',
        reverseCharge: !!full.reverseCharge, tdsApplicable: !!full.tdsApplicable, tdsSection: full.tdsSection || '',
        billingAddress: full.billingAddress || '', pincode: full.pincode || '',
        contactPerson: full.contactPerson || '', mobile: full.mobile || full.phone || '', email: full.email || '',
        openingBalance: full.openingBalance != null ? Number(full.openingBalance) : null,
        openingDrCr: full.openingDrCr || 'DR',
        creditLimit: full.creditLimit != null ? Number(full.creditLimit) : null,
        creditDays: full.creditDays != null ? Number(full.creditDays) : null,
        billByBill: full.billByBill !== false,
        defaultDiscountPct: full.defaultDiscountPct != null ? Number(full.defaultDiscountPct) : null,
        bankName: full.bankName || '', accountNumber: full.accountNumber || '', ifsc: full.ifsc || '', upiId: full.upiId || '',
        salesman: full.salesman || '', route: full.route || '', area: full.area || '',
        isActive: full.isActive !== false,
      };
      this.tagsText = Array.isArray(full.tags) ? full.tags.join(', ') : '';
      this.shipAddrs.set((full.shippingAddresses || full.shipping_addresses || []).map((a: any) => ({
        id: a.id, label: a.label, fullAddress: a.fullAddress || a.full_address, city: a.city, pincode: a.pincode, isDefault: a.isDefault ?? a.is_default,
      })));
      this.saved.set(null); this.apiError.set(null); this.dupWarn.set(null);
      this.revalidate();
      this.tick.update((t) => t + 1);
    });
  }

  startNew(): void {
    this.editId.set(null);
    this.f = this.blank();
    this.tagsText = '';
    this.shipAddrs.set([]);
    this.saved.set(null); this.apiError.set(null); this.dupWarn.set(null);
    this.errors.set({});
    setTimeout(() => (this.host.nativeElement.querySelector('input') as HTMLInputElement | null)?.focus());
  }

  /** Miracle: Ctrl+Enter accepts/saves (alias of Ctrl+A). */
  @HostListener('document:keydown.control.enter', ['$event'])
  onCtrlEnterSave(e: Event): void { this.onSaveKey(e as any); }

  @HostListener('document:keydown.control.a', ['$event'])
  onSaveKey(e: Event): void { e.preventDefault(); this.save(); }

  save(): void {
    if (!this.canSave() || this.saving()) return;
    this.saving.set(true);
    this.apiError.set(null);
    const body = {
      ...this.f,
      group: this.group,
      tags: this.tagsText.split(',').map((t) => t.trim()).filter(Boolean),
      openingBalance: this.f.openingBalance !== null ? Number(this.f.openingBalance) : undefined,
      creditLimit: this.f.creditLimit !== null ? Number(this.f.creditLimit) : undefined,
      creditDays: this.f.creditDays !== null ? Number(this.f.creditDays) : undefined,
      defaultDiscountPct: this.f.defaultDiscountPct !== null ? Number(this.f.defaultDiscountPct) : undefined,
    };
    const req = this.editId()
      ? this.entry.updateParty(this.group, this.editId()!, body)
      : this.entry.createParty(body);
    req.subscribe({
      next: (r: any) => {
        this.saving.set(false);
        this.saved.set(`Party "${this.f.partyName}" ${this.editId() ? 'updated' : 'created'} (ledger under Sundry ${this.group === 'creditor' ? 'Creditors' : 'Debtors'})`);
        if (!this.editId() && r?.id) this.editId.set(r.id);
        this.reload(true);
      },
      error: (err) => {
        this.saving.set(false);
        const fieldErrors = err?.error?.error?.errors || err?.error?.errors;
        if (fieldErrors) this.errors.set(fieldErrors);
        this.apiError.set(err?.error?.error?.message || err?.error?.message || 'Failed to save party');
      },
    });
  }

  softDelete(): void {
    const id = this.editId();
    if (!id || !confirm(`Deactivate "${this.f.partyName}"? (soft delete — history stays)`)) return;
    this.entry.deleteParty(this.group, id).subscribe({
      next: () => { this.saved.set(`"${this.f.partyName}" deactivated`); this.startNew(); this.reload(true); },
      error: (err) => this.apiError.set(err?.error?.message || 'Failed to deactivate'),
    });
  }

  addAddr(): void {
    const id = this.editId();
    if (!id || !this.newAddr.fullAddress?.trim()) return;
    this.entry.addPartyAddress(id, this.newAddr).subscribe({
      next: () => {
        this.newAddr = { fullAddress: '' };
        this.pick({ id, accountGroup: this.group });
      },
      error: (err) => this.apiError.set(err?.error?.message || 'Failed to add address'),
    });
  }

  removeAddr(a: ShipAddr): void {
    const id = this.editId();
    if (!id || !a.id) return;
    this.entry.removePartyAddress(id, a.id).subscribe(() => this.pick({ id, accountGroup: this.group }));
  }
}
