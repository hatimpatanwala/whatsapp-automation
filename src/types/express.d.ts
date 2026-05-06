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
    }

    interface SessionData {
      userId: string;
      userRole: string;
      tenantId: string;
      tenantSchema: string;
      adminId: string;
      adminRole: string;
      isAdmin: boolean;
    }
  }
}
