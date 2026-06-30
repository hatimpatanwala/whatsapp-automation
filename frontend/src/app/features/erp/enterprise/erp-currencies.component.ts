import { Component } from '@angular/core';
import { ErpCrudComponent, ErpCrudConfig } from '../shared/erp-crud.component';

@Component({
  selector: 'wa-erp-currencies', standalone: true, imports: [ErpCrudComponent],
  template: `<wa-erp-crud [config]="config" />`,
})
export class ErpCurrenciesComponent {
  config: ErpCrudConfig = {
    title: 'Currencies', subtitle: 'Multi-currency — exchange rate is base units per 1 unit of the currency',
    apiPath: '/erp/currencies', newLabel: 'New Currency', labelField: 'code', searchFields: ['code', 'name'],
    columns: [
      { field: 'code', header: 'Code' },
      { field: 'name', header: 'Name' },
      { field: 'symbol', header: 'Symbol' },
      { field: 'exchangeRate', header: 'Rate (→ base)' },
      { field: 'isBase', header: 'Base', type: 'boolean' },
      { field: 'enabled', header: 'Enabled', type: 'boolean' },
    ],
    fields: [
      { key: 'code', label: 'Code (ISO, e.g. USD)', type: 'text', required: true, half: true },
      { key: 'symbol', label: 'Symbol', type: 'text', half: true },
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'exchangeRate', label: 'Exchange Rate (base per 1 unit)', type: 'number', half: true },
      { key: 'enabled', label: 'Enabled', type: 'boolean', half: true, default: true },
    ],
  };
}
