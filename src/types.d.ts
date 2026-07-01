import 'express-session';
import { TenantContext } from './common/middleware/tenant-resolution.middleware';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    userRole?: string;
    tenantId?: string;
    tenantSchema?: string;
    adminId?: string;
    adminRole?: string;
    isAdmin?: boolean;
    adminPhone?: string;
  }
}

declare module 'express' {
  interface Request {
    tenantContext?: TenantContext;
    requestId?: string;
    rawBody?: string;
    session: import('express-session').Session & Partial<import('express-session').SessionData>;
  }
}
