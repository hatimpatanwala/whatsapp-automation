import { Component } from '@angular/core';
import { ErpCrudComponent, ErpCrudConfig } from '../erp/shared/erp-crud.component';

/**
 * Tax Rates — available to EVERY tenant (ERP or not). Reusable named rates
 * (entered as a percentage, e.g. 18) that the product form offers as a dropdown.
 * Backed by the un-gated /tax-rates endpoint.
 */
@Component({
  selector: 'wa-tax-rates',
  standalone: true,
  imports: [ErpCrudComponent],
  template: `<wa-erp-crud [config]="config" />`,
})
export class TaxRatesComponent {
  config: ErpCrudConfig = {
    title: 'Tax Rates',
    subtitle: 'Reusable tax rates for your products & invoices — enter a percentage (e.g. 18 for 18%)',
    apiPath: '/tax-rates', newLabel: 'New Tax Rate', labelField: 'name', searchFields: ['name'],
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
