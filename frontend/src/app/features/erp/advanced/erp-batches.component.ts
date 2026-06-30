import { Component } from '@angular/core';
import { ErpCrudComponent, ErpCrudConfig } from '../shared/erp-crud.component';

@Component({
  selector: 'wa-erp-batches', standalone: true, imports: [ErpCrudComponent],
  template: `<wa-erp-crud [config]="config" />`,
})
export class ErpBatchesComponent {
  config: ErpCrudConfig = {
    title: 'Batch & Serial Tracking', subtitle: 'Track product lots (batch/expiry) and serialised units',
    apiPath: '/erp/batches', newLabel: 'New Batch / Serial', labelField: 'batchNumber', searchFields: ['batchNumber', 'serialNumber'],
    columns: [
      { field: 'productName', header: 'Product' },
      { field: 'type', header: 'Type', type: 'badge', badgeMap: { batch: 'info', serial: 'contrast' } },
      { field: 'batchNumber', header: 'Batch #' },
      { field: 'serialNumber', header: 'Serial #' },
      { field: 'quantity', header: 'Qty' },
      { field: 'expiryDate', header: 'Expiry', type: 'date' },
      { field: 'warehouseName', header: 'Warehouse' },
    ],
    fields: [
      { key: 'productId', label: 'Product', type: 'select', required: true, half: true, optionsPath: '/products', optionLabelKey: 'name', optionValueKey: 'id' },
      { key: 'type', label: 'Type', type: 'select', half: true, default: 'batch', options: [{ label: 'Batch (lot)', value: 'batch' }, { label: 'Serial (unit)', value: 'serial' }] },
      { key: 'batchNumber', label: 'Batch Number', type: 'text', half: true },
      { key: 'serialNumber', label: 'Serial Number', type: 'text', half: true },
      { key: 'warehouseId', label: 'Warehouse', type: 'select', half: true, optionsPath: '/erp/warehouses', optionLabelKey: 'name', optionValueKey: 'id' },
      { key: 'quantity', label: 'Quantity', type: 'number', half: true },
      { key: 'mfgDate', label: 'Mfg Date', type: 'date', half: true },
      { key: 'expiryDate', label: 'Expiry Date', type: 'date', half: true },
      { key: 'costPrice', label: 'Cost Price', type: 'currency', half: true },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  };
}
