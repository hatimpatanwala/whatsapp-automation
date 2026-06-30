import { Component } from '@angular/core';
import { ErpCrudComponent, ErpCrudConfig } from '../shared/erp-crud.component';

@Component({
  selector: 'wa-erp-companies', standalone: true, imports: [ErpCrudComponent],
  template: `<wa-erp-crud [config]="config" />`,
})
export class ErpCompaniesComponent {
  config: ErpCrudConfig = {
    title: 'Companies', subtitle: 'CRM organisations — link contacts (People) to each company',
    apiPath: '/erp/companies', newLabel: 'New Company', labelField: 'name', searchFields: ['name', 'email', 'phone', 'taxNumber'],
    columns: [
      { field: 'name', header: 'Name' },
      { field: 'industry', header: 'Industry' },
      { field: 'email', header: 'Email' },
      { field: 'phone', header: 'Phone' },
      { field: 'taxNumber', header: 'Tax No.' },
    ],
    fields: [
      { key: 'name', label: 'Company Name', type: 'text', required: true, half: true },
      { key: 'industry', label: 'Industry', type: 'text', half: true },
      { key: 'email', label: 'Email', type: 'email', half: true },
      { key: 'phone', label: 'Phone', type: 'phone', half: true },
      { key: 'website', label: 'Website', type: 'text', half: true },
      { key: 'registrationNumber', label: 'Registration No.', type: 'text', half: true },
      { key: 'taxNumber', label: 'Tax / GSTIN', type: 'text', half: true },
      { key: 'country', label: 'Country', type: 'text', half: true },
      { key: 'address', label: 'Address', type: 'textarea' },
      { key: 'enabled', label: 'Active', type: 'boolean', default: true },
    ],
  };
}
