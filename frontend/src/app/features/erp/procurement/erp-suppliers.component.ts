import { Component } from '@angular/core';
import { ErpCrudComponent, ErpCrudConfig } from '../shared/erp-crud.component';

@Component({
  selector: 'wa-erp-suppliers', standalone: true, imports: [ErpCrudComponent],
  template: `<wa-erp-crud [config]="config" />`,
})
export class ErpSuppliersComponent {
  config: ErpCrudConfig = {
    title: 'Suppliers', subtitle: 'Vendors you purchase from',
    apiPath: '/erp/suppliers', newLabel: 'New Supplier', labelField: 'company',
    searchFields: ['company', 'contactName', 'phone', 'email', 'gstin'],
    columns: [
      { field: 'company', header: 'Company' },
      { field: 'contactName', header: 'Contact' },
      { field: 'phone', header: 'Phone' },
      { field: 'gstin', header: 'GSTIN' },
      { field: 'enabled', header: 'Active', type: 'boolean' },
    ],
    fields: [
      { key: 'company', label: 'Company', type: 'text', required: true, half: true },
      { key: 'contactName', label: 'Contact Name', type: 'text', half: true },
      { key: 'phone', label: 'Phone', type: 'phone', half: true },
      { key: 'email', label: 'Email', type: 'email', half: true },
      { key: 'gstin', label: 'GSTIN', type: 'text', half: true },
      { key: 'bankAccount', label: 'Bank Account', type: 'text', half: true },
      { key: 'address', label: 'Address', type: 'textarea' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
      { key: 'enabled', label: 'Active', type: 'boolean', default: true },
    ],
  };
}
