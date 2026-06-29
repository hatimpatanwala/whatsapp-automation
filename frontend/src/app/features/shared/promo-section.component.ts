import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PromoCartService } from './promo-cart.service';

/**
 * Offers + coupon block for the in-portal Create Order / Create Quote summaries.
 * Stateless view over a PromoCartService instance; the parent owns the cart and
 * handles (apply) by calling promo.applyCoupon with its current line items.
 */
@Component({
  selector: 'wa-promo-section',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (promo.offers().length) {
      <div class="border-t border-gray-100 pt-2 mt-1">
        <p class="text-[11px] font-semibold text-green-700 mb-1.5"><i class="pi pi-tag text-[10px] mr-1"></i>Offers</p>
        @for (o of promo.offers(); track o.schemeId) {
          <label class="flex items-center justify-between gap-2 py-1 cursor-pointer">
            <span class="flex items-center gap-2 min-w-0">
              <input type="checkbox" [checked]="promo.isOfferOn(o.schemeId)" (change)="promo.toggleOffer(o.schemeId)" class="accent-green-600" />
              <span class="text-xs text-gray-600 truncate">{{ o.name }} <span class="text-[10px] bg-green-100 text-green-700 rounded px-1">{{ o.label }}</span>@if (!o.combinable) { <span class="text-[9px] text-gray-400 ml-1">(not combinable)</span> }</span>
            </span>
            @if (o.discount > 0) {
              <span class="text-xs font-medium text-green-700 whitespace-nowrap">− {{ sym }}{{ o.discount | number:'1.0-2' }}</span>
            } @else if (o.freeItems?.length) {
              <span class="text-xs font-medium text-green-700 whitespace-nowrap">🎁 free</span>
            }
          </label>
        }
        @if (promo.freeItems().length) {
          <div class="bg-green-50 rounded-lg px-3 py-2 mt-1 space-y-1">
            <p class="text-[11px] font-semibold text-green-700">🎁 Free items added</p>
            @for (f of promo.freeItems(); track f.productId) {
              <div class="flex items-center justify-between text-xs text-gray-600">
                <span class="truncate">{{ f.quantity }} × {{ f.name }} <span class="text-[9px] bg-green-600 text-white rounded px-1 ml-1">FREE</span></span>
                <span class="text-gray-400 line-through">{{ sym }}{{ (f.quantity * f.unitPrice) | number:'1.0-2' }}</span>
              </div>
            }
          </div>
        }
        @if (promo.schemeDiscount() > 0) {
          <div class="flex items-center justify-between text-sm mt-1">
            <span class="text-gray-500">Offer discount</span>
            <span class="font-medium text-green-700">− {{ sym }}{{ promo.schemeDiscount() | number:'1.0-2' }}</span>
          </div>
        }
      </div>
    }

    <div class="border-t border-gray-100 pt-2 mt-1">
      @if (promo.appliedCoupon(); as cp) {
        <div class="flex items-center justify-between text-sm">
          <span class="flex items-center gap-2">
            <span class="text-[10px] bg-green-600 text-white rounded px-1.5 py-0.5 font-mono font-bold">{{ cp.code }}</span>
            <button type="button" class="text-[11px] text-red-500 hover:underline" (click)="promo.removeCoupon()">remove</button>
          </span>
          <span class="font-medium text-green-700">− {{ sym }}{{ cp.discount | number:'1.0-2' }}</span>
        </div>
      } @else {
        <div class="flex items-center gap-2">
          <input [(ngModel)]="couponInput" placeholder="Coupon code" class="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm uppercase" (keyup.enter)="emitApply()" />
          <button type="button" class="bg-gray-800 text-white text-xs font-medium rounded-lg px-3 py-1.5 disabled:opacity-50" [disabled]="promo.couponBusy() || !couponInput.trim()" (click)="emitApply()">{{ promo.couponBusy() ? '…' : 'Apply' }}</button>
        </div>
        @if (promo.couponError()) { <p class="text-[11px] text-red-500 mt-1">{{ promo.couponError() }}</p> }
      }
    </div>
  `,
})
export class PromoSectionComponent {
  @Input({ required: true }) promo!: PromoCartService;
  @Input() sym = '₹';
  @Output() apply = new EventEmitter<string>();
  couponInput = '';

  emitApply() {
    const code = this.couponInput.trim();
    if (!code) return;
    this.apply.emit(code);
    this.couponInput = '';
  }
}
