import { Component } from '@angular/core';
import { ErpCrudComponent, ErpCrudConfig } from '../shared/erp-crud.component';

@Component({
  selector: 'wa-erp-people', standalone: true, imports: [ErpCrudComponent],
  template: `<wa-erp-crud [config]="config" />`,
})
export class ErpPeopleComponent {
  config: ErpCrudConfig = {
    title: 'People', subtitle: 'Contacts — optionally linked to a company',
    apiPath: '/erp/people', newLabel: 'New Person', labelField: 'firstName', searchFields: ['firstName', 'lastName', 'email', 'phone'],
    columns: [
      { field: 'firstName', header: 'First Name' },
      { field: 'lastName', header: 'Last Name' },
      { field: 'companyName', header: 'Company' },
      { field: 'jobTitle', header: 'Title' },
      { field: 'phone', header: 'Phone' },
      { field: 'email', header: 'Email' },
    ],
    fields: [
      { key: 'firstName', label: 'First Name', type: 'text', required: true, half: true },
      { key: 'lastName', label: 'Last Name', type: 'text', half: true },
      { key: 'companyId', label: 'Company', type: 'select', half: true, optionsPath: '/erp/companies', optionLabelKey: 'name', optionValueKey: 'id' },
      { key: 'jobTitle', label: 'Job Title', type: 'text', half: true },
      { key: 'phone', label: 'Phone', type: 'phone', half: true },
      { key: 'email', label: 'Email', type: 'email', half: true },
      { key: 'notes', label: 'Notes', type: 'textarea' },
      { key: 'enabled', label: 'Active', type: 'boolean', default: true },
    ],
  };
}
