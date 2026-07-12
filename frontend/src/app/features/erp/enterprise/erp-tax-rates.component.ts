import { Component } from '@angular/core';
import { ErpCrudComponent, ErpCrudConfig } from '../shared/erp-crud.component';

@Component({
  selector: 'wa-erp-tax-rates', standalone: true, imports: [ErpCrudComponent],
  template: `<wa-erp-crud [config]="config" />`,
})
export class ErpTaxRatesComponent {
  config: ErpCrudConfig = {
    title: 'Tax Rates', feature: 'products', subtitle: 'Reusable tax rates for products, invoices and documents',
    apiPath: '/erp/tax-rates', newLabel: 'New Tax Rate', labelField: 'name', searchFields: ['name'],
    columns: [
      { field: 'name', header: 'Name' },
      { field: 'rate', header: 'Rate (%)' },
      { field: 'isDefault', header: 'Default', type: 'boolean' },
      { field: 'enabled', header: 'Enabled', type: 'boolean' },
    ],
    fields: [
      { key: 'name', label: 'Name (e.g. GST 18%)', type: 'text', required: true, half: true },
      { key: 'rate', label: 'Rate (%) — e.g. 18 for 18%', type: 'number', required: true, half: true, placeholder: '18' },
      { key: 'isDefault', label: 'Default', type: 'boolean', half: true },
      { key: 'enabled', label: 'Enabled', type: 'boolean', half: true, default: true },
    ],
  };
}
