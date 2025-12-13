// AuthController xử lý các request liên quan đến authentication

import {
  Controller,
  Post,
  Body,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ConfigService } from '@nestjs/config';

@Controller('auth') // base path = "/auth"
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private configService: ConfigService,
  ) {}

  /**
   * POST /auth/login
   * Đăng nhập user
   * @param loginDto - Email và password từ body
   * @param res - Express Response object (để set cookie)
   * @returns Thông tin user (không trả về token vì đã set vào cookie)
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // @Res() decorator inject Express Response object
    // passthrough: true = vẫn cho phép Nest trả về JSON response (không bị override)

    // Gọi AuthService.login() để xác thực và tạo JWT
    const { accessToken, user } = await this.authService.login(loginDto);

    // Set JWT vào HTTP-only cookie (bảo mật hơn so với localStorage)
    res.cookie('access_token', accessToken, {
      httpOnly: true, // JavaScript không thể đọc cookie này (chống XSS)
      secure: this.configService.get<boolean>('cookies.secure'), // true = chỉ gửi qua HTTPS
      sameSite: 'strict', // chống CSRF attack
      maxAge: 15 * 60 * 1000, // 15 phút (đổi theo JWT_ACCESS_EXPIRES)
      domain: this.configService.get<string>('cookies.domain'),
    });

    // Trả về thông tin user (KHÔNG trả về token vì đã set vào cookie)
    return {
      message: 'Login successful',
      user,
    };
  }

  /**
   * POST /auth/logout
   * Đăng xuất user (xóa cookie)
   * @param res - Express Response object
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    // Xóa cookie bằng cách set lại với maxAge = 0
    res.cookie('access_token', '', {
      httpOnly: true,
      secure: this.configService.get<boolean>('cookies.secure'),
      sameSite: 'strict',
      maxAge: 0, // 0 = xóa cookie ngay lập tức
      domain: this.configService.get<string>('cookies.domain'),
    });

    return {
      message: 'Logout successful',
    };
  }
}
