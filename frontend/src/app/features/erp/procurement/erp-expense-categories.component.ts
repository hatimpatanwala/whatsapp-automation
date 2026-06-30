import { Component } from '@angular/core';
import { ErpCrudComponent, ErpCrudConfig } from '../shared/erp-crud.component';

@Component({
  selector: 'wa-erp-expense-categories', standalone: true, imports: [ErpCrudComponent],
  template: `<wa-erp-crud [config]="config" />`,
})
export class ErpExpenseCategoriesComponent {
  config: ErpCrudConfig = {
    title: 'Expense Categories', subtitle: 'Group your business expenses',
    apiPath: '/erp/expense-categories', newLabel: 'New Category', labelField: 'name',
    searchFields: ['name', 'description'],
    columns: [
      { field: 'name', header: 'Name' },
      { field: 'description', header: 'Description' },
      { field: 'enabled', header: 'Active', type: 'boolean' },
    ],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'enabled', label: 'Active', type: 'boolean', default: true },
    ],
  };
}
