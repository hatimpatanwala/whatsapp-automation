import { ExecutionContext } from './workflow-engine.types';

/**
 * Resolve {{variable}} placeholders in message templates.
 * Looks up values from the execution context variables, then falls back to well-known keys.
 */
export function resolveTemplate(template: string, ctx: ExecutionContext): string {
  if (!template) return '';

  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    // Check ctx.variables first (highest priority — set during execution)
    if (ctx.variables[key] !== undefined && ctx.variables[key] !== null) {
      return String(ctx.variables[key]);
    }

    // Well-known built-in keys
    switch (key) {
      case 'customer_name':
        return ctx.customerName || 'Customer';
      case 'customer_phone':
        return ctx.customerPhone;
      default:
        return `{{${key}}}`; // leave unresolved
    }
  });
}
