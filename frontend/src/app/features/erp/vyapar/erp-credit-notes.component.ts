import { Component } from '@angular/core';
import { ErpDocComponent, ErpDocConfig } from '../shared/erp-doc.component';

@Component({
  selector: 'wa-erp-credit-notes', standalone: true, imports: [ErpDocComponent],
  template: `<wa-erp-doc [config]="config" />`,
})
export class ErpCreditNotesComponent {
  config: ErpDocConfig = {
    title: 'Credit Notes', subtitle: 'Sale returns — credit issued to customers',
    apiPath: '/erp/credit-notes', numberField: 'noteNumber',
    partyLabel: 'Customer', partyField: 'customerId', partyNameField: 'customerName',
    partyOptionsPath: '/erp/clients', partyLabelExpr: (r) => r.name + (r.company ? ` (${r.company})` : ''),
    statuses: [{ label: 'Issued', value: 'issued' }],
    statusBadge: { issued: 'info' },
    removeMethod: 'put-remove',
  };
}
