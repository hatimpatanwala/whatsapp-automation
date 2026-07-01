import 'express-session';

declare global {
  namespace Express {
    interface Request {
      tenantContext?: {
        id: string;
        schemaName: string;
        phoneNumberId?: string;
        accessToken?: string;
        wabaId?: string;
      };
      session: Session & Partial<SessionData>;
    }

    interface SessionData {
      userId: string;
      userRole: string;
      tenantId: string;
      tenantSchema: string;
      adminId: string;
      adminRole: string;
      isAdmin: boolean;
      adminPhone: string;
    }
  }
}
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    userRole?: string;

    adminId?: string;
    adminRole?: string;

    tenantId?: string;
    tenantSchema?: string;

    isAdmin?: boolean;
    adminPhone?: string;
  }
}
