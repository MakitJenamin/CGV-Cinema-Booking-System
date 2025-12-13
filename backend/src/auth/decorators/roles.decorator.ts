// Roles decorator đánh dấu route cần roles nào mới được truy cập
// VD: @Roles('admin', 'staff') → chỉ admin hoặc staff mới vào được

import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
