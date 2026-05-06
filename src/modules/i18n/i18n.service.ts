import { Injectable } from '@nestjs/common';
import * as en from './locales/en.json';
import * as hi from './locales/hi.json';

@Injectable()
export class I18nService {
  private readonly translations: Record<string, Record<string, string>> = {
    en,
    hi,
  };

  translate(key: string, language = 'en', params?: Record<string, string>): string {
    const lang = this.translations[language] || this.translations['en'];
    let text = lang[key] || this.translations['en'][key] || key;

    if (params) {
      Object.entries(params).forEach(([param, value]) => {
        text = text.replace(`{{${param}}}`, value);
      });
    }

    return text;
  }

  getTranslatedField(translations: Record<string, any>, field: string, language: string, fallback: string): string {
    if (translations && translations[language] && translations[language][field]) {
      return translations[language][field];
    }
    return fallback;
  }
}
