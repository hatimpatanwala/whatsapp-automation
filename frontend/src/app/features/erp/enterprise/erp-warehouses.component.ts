import { Component } from '@angular/core';
import { ErpCrudComponent, ErpCrudConfig } from '../shared/erp-crud.component';

@Component({
  selector: 'wa-erp-warehouses', standalone: true, imports: [ErpCrudComponent],
  template: `<wa-erp-crud [config]="config" />`,
})
export class ErpWarehousesComponent {
  config: ErpCrudConfig = {
    title: 'Warehouses', subtitle: 'Stock locations for multi-warehouse inventory',
    apiPath: '/erp/warehouses', newLabel: 'New Warehouse', labelField: 'name', searchFields: ['name', 'code'],
    columns: [
      { field: 'name', header: 'Name' },
      { field: 'code', header: 'Code' },
      { field: 'isDefault', header: 'Default', type: 'boolean' },
      { field: 'enabled', header: 'Enabled', type: 'boolean' },
    ],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, half: true },
      { key: 'code', label: 'Code', type: 'text', half: true },
      { key: 'address', label: 'Address', type: 'textarea' },
      { key: 'isDefault', label: 'Default', type: 'boolean', half: true },
      { key: 'enabled', label: 'Enabled', type: 'boolean', half: true, default: true },
    ],
  };
}
