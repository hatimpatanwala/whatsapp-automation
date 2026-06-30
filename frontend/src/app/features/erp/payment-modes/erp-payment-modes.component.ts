import { Component } from '@angular/core';
import { ErpCrudComponent, ErpCrudConfig } from '../shared/erp-crud.component';

@Component({
  selector: 'wa-erp-payment-modes',
  standalone: true,
  imports: [ErpCrudComponent],
  template: `<wa-erp-crud [config]="config" />`,
})
export class ErpPaymentModesComponent {
  config: ErpCrudConfig = {
    title: 'Payment Modes',
    subtitle: 'Methods you accept for invoice payments',
    apiPath: '/erp/payment-modes',
    newLabel: 'New Mode',
    labelField: 'name',
    searchFields: ['name', 'description'],
    columns: [
      { field: 'name', header: 'Name' },
      { field: 'description', header: 'Description' },
      { field: 'isDefault', header: 'Default', type: 'boolean' },
      { field: 'enabled', header: 'Enabled', type: 'boolean' },
    ],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, half: true },
      { key: 'ref', label: 'Reference', type: 'text', half: true },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'isDefault', label: 'Default mode', type: 'boolean', half: true },
      { key: 'enabled', label: 'Enabled', type: 'boolean', half: true, default: true },
    ],
  };
}
