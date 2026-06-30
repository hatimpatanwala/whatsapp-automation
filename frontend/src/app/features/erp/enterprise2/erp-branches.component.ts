import { Component } from '@angular/core';
import { ErpCrudComponent, ErpCrudConfig } from '../shared/erp-crud.component';

@Component({
  selector: 'wa-erp-branches', standalone: true, imports: [ErpCrudComponent],
  template: `<wa-erp-crud [config]="config" />`,
})
export class ErpBranchesComponent {
  config: ErpCrudConfig = {
    title: 'Branches', subtitle: 'Operate multiple branches within your company',
    apiPath: '/erp/branches', newLabel: 'New Branch', labelField: 'name', searchFields: ['name', 'code', 'manager'],
    columns: [
      { field: 'name', header: 'Name' },
      { field: 'code', header: 'Code' },
      { field: 'manager', header: 'Manager' },
      { field: 'phone', header: 'Phone' },
      { field: 'isDefault', header: 'Default', type: 'boolean' },
    ],
    fields: [
      { key: 'name', label: 'Branch Name', type: 'text', required: true, half: true },
      { key: 'code', label: 'Code', type: 'text', half: true },
      { key: 'manager', label: 'Manager', type: 'text', half: true },
      { key: 'phone', label: 'Phone', type: 'phone', half: true },
      { key: 'address', label: 'Address', type: 'textarea' },
      { key: 'isDefault', label: 'Default branch', type: 'boolean', half: true },
      { key: 'enabled', label: 'Active', type: 'boolean', half: true, default: true },
    ],
  };
}
