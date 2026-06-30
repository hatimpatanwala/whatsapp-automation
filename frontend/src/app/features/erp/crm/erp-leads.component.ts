import { Component } from '@angular/core';
import { ErpCrudComponent, ErpCrudConfig } from '../shared/erp-crud.component';

@Component({
  selector: 'wa-erp-leads', standalone: true, imports: [ErpCrudComponent],
  template: `<wa-erp-crud [config]="config" />`,
})
export class ErpLeadsComponent {
  config: ErpCrudConfig = {
    title: 'Leads', subtitle: 'Sales pipeline — capture and qualify prospects',
    apiPath: '/erp/leads', newLabel: 'New Lead', labelField: 'firstName',
    searchFields: ['firstName', 'lastName', 'company', 'phone', 'email'],
    columns: [
      { field: 'firstName', header: 'First Name' },
      { field: 'lastName', header: 'Last Name' },
      { field: 'company', header: 'Company' },
      { field: 'phone', header: 'Phone' },
      { field: 'source', header: 'Source' },
      { field: 'status', header: 'Status', type: 'badge', badgeMap: { new: 'info', contacted: 'secondary', interested: 'warn', qualified: 'success', converted: 'contrast', lost: 'danger' } },
    ],
    fields: [
      { key: 'firstName', label: 'First Name', type: 'text', required: true, half: true },
      { key: 'lastName', label: 'Last Name', type: 'text', half: true },
      { key: 'company', label: 'Company', type: 'text', half: true },
      { key: 'jobTitle', label: 'Job Title', type: 'text', half: true },
      { key: 'phone', label: 'Phone', type: 'phone', half: true },
      { key: 'email', label: 'Email', type: 'email', half: true },
      { key: 'source', label: 'Source', type: 'text', half: true },
      { key: 'status', label: 'Status', type: 'select', half: true, default: 'new',
        options: ['new', 'contacted', 'interested', 'qualified', 'converted', 'lost'].map((v) => ({ label: v, value: v })) },
      { key: 'address', label: 'Address', type: 'textarea' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  };
}
