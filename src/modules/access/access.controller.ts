import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AccessService } from './access.service';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';

/**
 * RBAC admin API + the current user's effective permissions. Managing employees
 * and roles requires `employees:write` (the owner always has it); reading the
 * team requires `employees:read`. `my-permissions` is open to any signed-in
 * tenant user (they need to know their own access to render the UI).
 */
@Controller('access')
export class AccessController {
  constructor(private readonly access: AccessService) {}

  private schema(req: Request): string {
    const schema = req.tenantContext?.schemaName || (req.session as any)?.tenantSchema;
    if (!schema) throw new UnauthorizedException('No tenant context');
    return schema;
  }

  /** The permissionable feature catalog (for the role matrix UI). */
  @Get('features')
  features() { return this.access.features(); }

  /** The signed-in user's own effective permissions (drives UI visibility). */
  @Get('my-permissions')
  async myPermissions(@Req() req: Request) {
    const userId = (req.session as any)?.userId;
    if (!userId) return { owner: false, permissions: {} };
    return this.access.getPermissions(this.schema(req), userId);
  }

  // ─── Roles ──────────────────────────────────────────────────────────────────
  @Get('roles')
  @UseGuards(PermissionGuard) @RequiresPermission('employees', 'read')
  roles(@Req() req: Request) { return this.access.listRoles(this.schema(req)); }

  @Post('roles')
  @UseGuards(PermissionGuard) @RequiresPermission('employees', 'write')
  createRole(@Req() req: Request, @Body() body: any) { return this.access.createRole(this.schema(req), body); }

  @Patch('roles/:id')
  @UseGuards(PermissionGuard) @RequiresPermission('employees', 'write')
  updateRole(@Req() req: Request, @Param('id') id: string, @Body() body: any) { return this.access.updateRole(this.schema(req), id, body); }

  @Delete('roles/:id')
  @UseGuards(PermissionGuard) @RequiresPermission('employees', 'write')
  deleteRole(@Req() req: Request, @Param('id') id: string) { return this.access.deleteRole(this.schema(req), id); }

  // ─── Employees ────────────────────────────────────────────────────────────────
  @Get('employees')
  @UseGuards(PermissionGuard) @RequiresPermission('employees', 'read')
  employees(@Req() req: Request) { return this.access.listEmployees(this.schema(req)); }

  @Post('employees')
  @UseGuards(PermissionGuard) @RequiresPermission('employees', 'write')
  createEmployee(@Req() req: Request, @Body() body: any) { return this.access.createEmployee(this.schema(req), body); }

  @Patch('employees/:id')
  @UseGuards(PermissionGuard) @RequiresPermission('employees', 'write')
  updateEmployee(@Req() req: Request, @Param('id') id: string, @Body() body: any) { return this.access.updateEmployee(this.schema(req), id, body); }
}
