import { Component } from '@angular/core';
import { ErpCrudComponent, ErpCrudConfig } from '../shared/erp-crud.component';

@Component({
  selector: 'wa-erp-bank-accounts', standalone: true, imports: [ErpCrudComponent],
  template: `<wa-erp-crud [config]="config" />`,
})
export class ErpBankAccountsComponent {
  config: ErpCrudConfig = {
    title: 'Cash & Bank', subtitle: 'Money accounts — cash in hand and bank accounts',
    apiPath: '/erp/bank-accounts', newLabel: 'New Account', labelField: 'name', searchFields: ['name', 'bankName', 'accountNumber'],
    columns: [
      { field: 'name', header: 'Account' },
      { field: 'type', header: 'Type', type: 'badge', badgeMap: { cash: 'success', bank: 'info' } },
      { field: 'bankName', header: 'Bank' },
      { field: 'currentBalance', header: 'Balance', type: 'currency' },
      { field: 'isDefault', header: 'Default', type: 'boolean' },
    ],
    fields: [
      { key: 'name', label: 'Account Name', type: 'text', required: true, half: true },
      { key: 'type', label: 'Type', type: 'select', half: true, default: 'bank', options: [{ label: 'Bank', value: 'bank' }, { label: 'Cash', value: 'cash' }] },
      { key: 'bankName', label: 'Bank Name', type: 'text', half: true },
      { key: 'accountNumber', label: 'Account Number', type: 'text', half: true },
      { key: 'openingBalance', label: 'Opening Balance', type: 'currency', half: true },
      { key: 'isDefault', label: 'Default account', type: 'boolean', half: true },
      { key: 'enabled', label: 'Active', type: 'boolean', default: true },
    ],
  };
}
