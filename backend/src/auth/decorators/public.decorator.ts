// Public decorator đánh dấu route là công khai (không cần JWT)
// VD: POST /auth/login là public vì user chưa có token

import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
