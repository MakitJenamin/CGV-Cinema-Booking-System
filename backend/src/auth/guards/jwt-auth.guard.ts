// JwtAuthGuard bảo vệ route - chỉ cho phép request có JWT hợp lệ mới vào được
// Guard này sử dụng JwtStrategy để verify token

import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  /**
   * Override canActivate() để kiểm tra route có @Public() decorator không
   * Nếu có @Public() → không cần JWT (cho phép truy cập công khai)
   */
  canActivate(context: ExecutionContext) {
    // Kiểm tra route có @Public() decorator không
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    // Nếu là public route → bỏ qua JWT check
    if (isPublic) {
      return true;
    }

    // Nếu không phải public → gọi canActivate() của AuthGuard('jwt')
    // AuthGuard sẽ gọi JwtStrategy.validate() để verify JWT
    return super.canActivate(context);
  }
}
