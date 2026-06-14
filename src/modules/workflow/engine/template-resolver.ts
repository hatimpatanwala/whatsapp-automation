import { ExecutionContext } from './workflow-engine.types';

/**
 * Resolve {{variable}} placeholders in message templates.
 * Looks up values from the execution context variables, then falls back to well-known keys.
 */
export function resolveTemplate(template: any, ctx: ExecutionContext): string {
  if (template === null || template === undefined || template === '') return '';

  // Coerce non-string config values (arrays / objects / numbers) defensively so
  // a mis-typed workflow config never crashes execution with ".replace/.split
  // is not a function".
  let str: string;
  if (typeof template === 'string') {
    str = template;
  } else if (Array.isArray(template)) {
    str = template.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n');
  } else if (typeof template === 'object') {
    str = JSON.stringify(template);
  } else {
    str = String(template);
  }

  return str.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
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
