import { Component, signal } from '@angular/core';
import { ErpCompaniesComponent } from './erp-companies.component';
import { ErpPeopleComponent } from './erp-people.component';

/**
 * Companies & People merged into one screen (they serve the same CRM purpose).
 * A simple tab switch hosts the existing two CRUD screens — Companies for
 * organisations, People for contacts (with their Title/post + phone).
 */
@Component({
  selector: 'wa-erp-contacts',
  standalone: true,
  imports: [ErpCompaniesComponent, ErpPeopleComponent],
  template: `
    <div class="p-4">
      <div class="flex items-center gap-2 mb-2">
        <button (click)="tab.set('companies')"
          class="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          [class.bg-indigo-600]="tab() === 'companies'" [class.text-white]="tab() === 'companies'"
          [class.bg-gray-100]="tab() !== 'companies'" [class.text-gray-600]="tab() !== 'companies'">
          <i class="pi pi-building text-xs mr-1"></i> Companies
        </button>
        <button (click)="tab.set('people')"
          class="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          [class.bg-indigo-600]="tab() === 'people'" [class.text-white]="tab() === 'people'"
          [class.bg-gray-100]="tab() !== 'people'" [class.text-gray-600]="tab() !== 'people'">
          <i class="pi pi-user text-xs mr-1"></i> People
        </button>
      </div>
    </div>
    @if (tab() === 'companies') { <wa-erp-companies /> } @else { <wa-erp-people /> }
  `,
})
export class ErpContactsComponent {
  readonly tab = signal<'companies' | 'people'>('companies');
}
