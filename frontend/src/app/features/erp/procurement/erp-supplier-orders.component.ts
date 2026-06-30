import { Component } from '@angular/core';
import { ErpDocComponent, ErpDocConfig } from '../shared/erp-doc.component';

@Component({
  selector: 'wa-erp-supplier-orders', standalone: true, imports: [ErpDocComponent],
  template: `<wa-erp-doc [config]="config" />`,
})
export class ErpSupplierOrdersComponent {
  config: ErpDocConfig = {
    title: 'Purchase Orders', subtitle: 'Orders raised to your suppliers',
    apiPath: '/erp/supplier-orders', numberField: 'orderNumber',
    partyLabel: 'Supplier', partyField: 'supplierId', partyNameField: 'supplierName',
    partyOptionsPath: '/erp/suppliers', partyLabelExpr: (r) => r.company,
    statuses: ['draft', 'ordered', 'received', 'cancelled'].map((v) => ({ label: v, value: v })),
    statusBadge: { draft: 'secondary', ordered: 'info', received: 'success', cancelled: 'danger' },
    removeMethod: 'put-remove',
  };
}
