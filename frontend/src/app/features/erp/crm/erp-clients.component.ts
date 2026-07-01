import { Component } from '@angular/core';
import { ErpCrudComponent, ErpCrudConfig } from '../shared/erp-crud.component';

@Component({
  selector: 'wa-erp-clients', standalone: true, imports: [ErpCrudComponent],
  template: `<wa-erp-crud [config]="config" />`,
})
export class ErpClientsComponent {
  config: ErpCrudConfig = {
    title: 'Clients', subtitle: 'Every customer who messages you — add billing details to invoice them',
    apiPath: '/erp/clients', newLabel: 'New Client', labelField: 'name',
    rowLink: '/customers', // click a client → full 360 profile (orders, invoices, quotes, payments, ledger)
    searchFields: ['name', 'company', 'phone', 'email'],
    columns: [
      { field: 'name', header: 'Name' },
      { field: 'company', header: 'Company' },
      { field: 'phone', header: 'Phone' },
      { field: 'gstin', header: 'GSTIN' },
      { field: 'totalSpent', header: 'Spent', type: 'currency' },
    ],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, half: true },
      { key: 'phone', label: 'Phone', type: 'phone', half: true },
      { key: 'company', label: 'Company', type: 'text', half: true },
      { key: 'gstin', label: 'GSTIN', type: 'text', half: true },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'billingAddress', label: 'Billing Address', type: 'textarea' },
    ],
  };
}
