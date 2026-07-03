import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface LedgerGroup { id: string; name: string; nature: string; }
export interface Ledger { id: string; name: string; groupId: string; groupName?: string; nature?: string; openingBalance?: number; openingType?: string; }
export interface VoucherEntry { ledgerId: string; debit?: number; credit?: number; narration?: string; }
export interface CreateVoucher {
  type: string;
  date?: string;
  narration?: string;
  partyLedgerId?: string;
  reference?: string;
  entries: VoucherEntry[];
}

/** Client for the double-entry accounting API (Phase 4). */
@Injectable({ providedIn: 'root' })
export class AccountingService {
  private readonly api = inject(ApiService);

  groups(): Observable<LedgerGroup[]> { return this.api.get<LedgerGroup[]>('/accounting/groups'); }
  ledgers(): Observable<Ledger[]> { return this.api.get<Ledger[]>('/accounting/ledgers'); }
  createLedger(dto: Partial<Ledger>): Observable<Ledger> { return this.api.post<Ledger>('/accounting/ledgers', dto); }

  vouchers(params?: Record<string, string>): Observable<any[]> { return this.api.get<any[]>('/accounting/vouchers', params); }
  voucher(id: string): Observable<any> { return this.api.get<any>(`/accounting/vouchers/${id}`); }
  createVoucher(dto: CreateVoucher): Observable<any> { return this.api.post<any>('/accounting/vouchers', dto); }
  cancelVoucher(id: string): Observable<any> { return this.api.post<any>(`/accounting/vouchers/${id}/cancel`, {}); }

  trialBalance(asOf?: string): Observable<any> { return this.api.get<any>('/accounting/reports/trial-balance', asOf ? { asOf } : undefined); }
  pnl(from?: string, to?: string): Observable<any> { return this.api.get<any>('/accounting/reports/pnl', { from, to }); }
  balanceSheet(asOf?: string): Observable<any> { return this.api.get<any>('/accounting/reports/balance-sheet', asOf ? { asOf } : undefined); }
  dayBook(date?: string): Observable<any> { return this.api.get<any>('/accounting/reports/day-book', date ? { date } : undefined); }
  ageing(): Observable<any> { return this.api.get<any>('/accounting/reports/ageing'); }
  ledgerStatement(id: string, from?: string, to?: string): Observable<any> { return this.api.get<any>(`/accounting/reports/ledger/${id}`, { from, to }); }
}
