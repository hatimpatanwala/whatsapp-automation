import { Component } from '@angular/core';
import { ErpCrudComponent, ErpCrudConfig } from '../shared/erp-crud.component';

@Component({
  selector: 'wa-erp-employees', standalone: true, imports: [ErpCrudComponent],
  template: `<wa-erp-crud [config]="config" />`,
})
export class ErpEmployeesComponent {
  config: ErpCrudConfig = {
    title: 'Employees', subtitle: 'Your team directory',
    apiPath: '/erp/employees', newLabel: 'New Employee', labelField: 'name',
    searchFields: ['name', 'surname', 'department', 'position', 'phone', 'email'],
    columns: [
      { field: 'name', header: 'Name' },
      { field: 'surname', header: 'Surname' },
      { field: 'department', header: 'Department' },
      { field: 'position', header: 'Position' },
      { field: 'phone', header: 'Phone' },
      { field: 'status', header: 'Status', type: 'badge', badgeMap: { active: 'success', inactive: 'secondary' } },
    ],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, half: true },
      { key: 'surname', label: 'Surname', type: 'text', half: true },
      { key: 'department', label: 'Department', type: 'text', half: true },
      { key: 'position', label: 'Position', type: 'text', half: true },
      { key: 'phone', label: 'Phone', type: 'phone', half: true },
      { key: 'email', label: 'Email', type: 'email', half: true },
      { key: 'gender', label: 'Gender', type: 'select', half: true, options: ['male', 'female', 'other'].map((v) => ({ label: v, value: v })) },
      { key: 'birthday', label: 'Birthday', type: 'date', half: true },
      { key: 'salary', label: 'Salary', type: 'currency', half: true },
      { key: 'status', label: 'Status', type: 'select', half: true, default: 'active', options: ['active', 'inactive'].map((v) => ({ label: v, value: v })) },
      { key: 'urgentContact', label: 'Emergency Contact', type: 'text', half: true },
      { key: 'address', label: 'Address', type: 'textarea' },
    ],
  };
}
