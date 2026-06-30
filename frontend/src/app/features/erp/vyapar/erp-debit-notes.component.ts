import { Component } from '@angular/core';
import { ErpDocComponent, ErpDocConfig } from '../shared/erp-doc.component';

@Component({
  selector: 'wa-erp-debit-notes', standalone: true, imports: [ErpDocComponent],
  template: `<wa-erp-doc [config]="config" />`,
})
export class ErpDebitNotesComponent {
  config: ErpDocConfig = {
    title: 'Debit Notes', subtitle: 'Purchase returns — debit raised to suppliers',
    apiPath: '/erp/debit-notes', numberField: 'noteNumber',
    partyLabel: 'Supplier', partyField: 'supplierId', partyNameField: 'supplierName',
    partyOptionsPath: '/erp/suppliers', partyLabelExpr: (r) => r.company,
    statuses: [{ label: 'Issued', value: 'issued' }],
    statusBadge: { issued: 'info' },
    removeMethod: 'put-remove',
  };
}
