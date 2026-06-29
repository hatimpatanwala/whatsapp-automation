import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/services/api.service';

export interface PromoFreeItem { productId: string; name: string; quantity: number; unitPrice: number; }
export interface PromoOffer {
  schemeId: string; name: string; label: string; description?: string;
  combinable: boolean; weight: number; discount: number; saving: number; freeItems: PromoFreeItem[];
}
export interface PromoLine { productId?: string | null; quantity: number; unitPrice: number; }

/**
 * Offers + coupon evaluation for the in-portal Create Order / Create Quote pages.
 * Mirrors the WhatsApp builder webview logic against the authenticated
 * /schemes/evaluate and /coupons/validate endpoints. Provided per-component
 * (NOT root) so each form gets its own cart state.
 */
@Injectable()
export class PromoCartService {
  private readonly api = inject(ApiService);
  private timer: any = null;

  offers = signal<PromoOffer[]>([]);
  selectedOfferIds = signal<string[]>([]);
  appliedCoupon = signal<{ code: string; discount: number; label: string } | null>(null);
  couponError = signal<string | null>(null);
  couponBusy = signal(false);

  /** Honour the combinable rule: a non-combinable pick wins alone; else combinables stack. */
  effectiveOffers = computed(() => {
    const sel = this.offers().filter(o => this.selectedOfferIds().includes(o.schemeId));
    if (!sel.length) return [] as PromoOffer[];
    const nonComb = sel.filter(o => !o.combinable);
    if (nonComb.length) {
      const best = [...nonComb].sort((a, b) => b.weight - a.weight || (b.saving || b.discount) - (a.saving || a.discount))[0];
      return [best];
    }
    return sel;
  });
  schemeDiscount = computed(() => Math.round(this.effectiveOffers().reduce((s, o) => s + (Number(o.discount) || 0), 0) * 100) / 100);
  freeItems = computed<PromoFreeItem[]>(() => this.effectiveOffers().flatMap(o => o.freeItems || []));
  couponDiscount = computed(() => this.appliedCoupon()?.discount || 0);
  totalDiscount = computed(() => this.schemeDiscount() + this.couponDiscount());

  toggleOffer(id: string) { const s = new Set(this.selectedOfferIds()); s.has(id) ? s.delete(id) : s.add(id); this.selectedOfferIds.set([...s]); }
  isOfferOn(id: string) { return this.selectedOfferIds().includes(id); }

  private payload(lines: PromoLine[]) {
    return lines.filter(l => l.productId).map(l => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice }));
  }

  /** Re-evaluate offers (and re-validate any applied coupon) against the cart, debounced. */
  refresh(lines: PromoLine[], customerId?: string) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const items = this.payload(lines);
      if (!items.length) { this.offers.set([]); this.selectedOfferIds.set([]); this.appliedCoupon.set(null); return; }
      this.api.post<any>('/schemes/evaluate', { items, customerId }).subscribe({
        next: (r) => { this.offers.set((r?.applicable || []).map(this.mapOffer)); this.selectedOfferIds.set(r?.recommendedIds || []); },
        error: () => { this.offers.set([]); this.selectedOfferIds.set([]); },
      });
      const applied = this.appliedCoupon();
      if (applied) {
        this.api.post<any>('/coupons/validate', { code: applied.code, items, customerId }).subscribe({
          next: (r) => {
            if (r?.valid && r?.coupon) this.appliedCoupon.set({ code: r.coupon.code, discount: r.discount, label: r.coupon.label });
            else { this.appliedCoupon.set(null); this.couponError.set(r?.reason || 'Coupon no longer applies.'); }
          },
        });
      }
    }, 300);
  }

  applyCoupon(code: string, lines: PromoLine[], customerId?: string) {
    const c = (code || '').trim();
    if (!c) return;
    const items = this.payload(lines);
    this.couponBusy.set(true); this.couponError.set(null);
    this.api.post<any>('/coupons/validate', { code: c, items, customerId }).subscribe({
      next: (r) => {
        this.couponBusy.set(false);
        if (r?.valid && r?.coupon) this.appliedCoupon.set({ code: r.coupon.code, discount: r.discount, label: r.coupon.label });
        else this.couponError.set(r?.reason || 'Invalid coupon.');
      },
      error: (e) => { this.couponBusy.set(false); this.couponError.set(e?.error?.message || 'Could not apply coupon.'); },
    });
  }
  removeCoupon() { this.appliedCoupon.set(null); this.couponError.set(null); }
  reset() { this.offers.set([]); this.selectedOfferIds.set([]); this.appliedCoupon.set(null); this.couponError.set(null); }

  private mapOffer = (o: any): PromoOffer => ({
    schemeId: o.schemeId, name: o.name, label: o.label, description: o.description,
    combinable: !!o.combinable, weight: Number(o.weight) || 0, discount: Number(o.discount) || 0, saving: Number(o.saving) || 0,
    freeItems: (o.freeItems || []).map((f: any) => ({ productId: f.productId, name: f.name, quantity: f.quantity, unitPrice: f.unitPrice })),
  });
}
