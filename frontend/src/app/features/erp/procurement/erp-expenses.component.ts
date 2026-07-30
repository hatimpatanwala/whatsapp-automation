import { Component } from '@angular/core';
import { ErpCrudComponent, ErpCrudConfig } from '../shared/erp-crud.component';

@Component({
  selector: 'wa-erp-expenses', standalone: true, imports: [ErpCrudComponent],
  template: `<wa-erp-crud [config]="config" />`,
})
export class ErpExpensesComponent {
  config: ErpCrudConfig = {
    title: 'Expenses', feature: 'purchases', subtitle: 'Track business spending',
    apiPath: '/erp/expenses', newLabel: 'New Expense', labelField: 'name',
    searchFields: ['name', 'description', 'ref'],
    columns: [
      { field: 'name', header: 'Expense' },
      { field: 'category', header: 'Category' },
      { field: 'amount', header: 'Amount', type: 'currency' },
      { field: 'taxAmount', header: 'Tax', type: 'currency' },
      { field: 'total', header: 'Total', type: 'currency' },
      { field: 'paidVia', header: 'Paid Via' },
      { field: 'expenseDate', header: 'Date', type: 'date' },
    ],
    fields: [
      { key: 'name', label: 'Expense', type: 'text', required: true, half: true },
      { key: 'ref', label: 'Reference', type: 'text', half: true },
      { key: 'category', label: 'Category', type: 'text', half: true, placeholder: 'e.g. Travel, Rent, Utilities' },
      { key: 'supplierId', label: 'Supplier', type: 'select', half: true, optionsPath: '/erp/suppliers', optionLabelKey: 'company', optionValueKey: 'id' },
      { key: 'amount', label: 'Amount', type: 'currency', required: true, half: true },
      { key: 'taxAmount', label: 'Tax Amount', type: 'currency', half: true },
      { key: 'paidVia', label: 'Paid Via', type: 'select', half: true, options: [
        { label: 'Cash', value: 'cash' }, { label: 'Bank', value: 'bank' }, { label: 'UPI', value: 'upi' },
      ] },
      { key: 'expenseDate', label: 'Date', type: 'date', half: true },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
  };
}
