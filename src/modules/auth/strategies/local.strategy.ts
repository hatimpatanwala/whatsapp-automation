import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      usernameField: 'phone',
      passwordField: 'password',
      passReqToCallback: true,
    });
  }

  async validate(req: any, phone: string, password: string): Promise<any> {
    const tenantSchema = req.tenantContext?.schemaName;
    if (!tenantSchema) {
      throw new Error('Tenant context required for authentication');
    }
    return this.authService.validateUser(tenantSchema, phone, password);
  }
}
