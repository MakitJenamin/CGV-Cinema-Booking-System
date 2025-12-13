// RolesGuard kiểm tra user có đủ roles để truy cập route không
// Guard này chạy SAU JwtAuthGuard (đảm bảo user đã được xác thực)

import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Lấy danh sách roles yêu cầu từ @Roles() decorator
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Nếu route không có @Roles() → cho phép truy cập (không yêu cầu role cụ thể)
    if (!requiredRoles) {
      return true;
    }

    // Lấy user từ request (đã được set bởi JwtAuthGuard)
    const { user } = context.switchToHttp().getRequest();

    // Kiểm tra user có ít nhất 1 role trong requiredRoles không
    // VD: requiredRoles = ['admin', 'staff'], user.roles = ['user', 'staff'] → true
    return requiredRoles.some((role) => user?.roles?.includes(role));
  }
}
