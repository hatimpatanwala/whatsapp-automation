import { Component } from '@angular/core';
import { ErpDocComponent, ErpDocConfig } from '../shared/erp-doc.component';

@Component({
  selector: 'wa-erp-offers', standalone: true, imports: [ErpDocComponent],
  template: `<wa-erp-doc [config]="config" />`,
})
export class ErpOffersComponent {
  config: ErpDocConfig = {
    title: 'Offers', subtitle: 'Proposals to leads — convert accepted offers into invoices',
    apiPath: '/erp/offers', numberField: 'offerNumber',
    partyLabel: 'Lead', partyField: 'leadId', partyNameField: 'leadName',
    partyOptionsPath: '/erp/leads', partyLabelExpr: (r) => [r.firstName, r.lastName].filter(Boolean).join(' ') + (r.company ? ` (${r.company})` : ''),
    hasTitle: true,
    statuses: ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'].map((v) => ({ label: v, value: v })),
    statusBadge: { draft: 'secondary', sent: 'info', accepted: 'success', rejected: 'danger', expired: 'warn', converted: 'contrast' },
    convertLabel: 'Convert to Invoice',
    removeMethod: 'put-remove',
  };
}
