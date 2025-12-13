// AuthService xử lý logic đăng nhập, tạo JWT token, logout...

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService, // JwtService do @nestjs/jwt cung cấp, dùng để tạo/verify JWT
    private configService: ConfigService,
  ) {}

  /**
   * Đăng nhập user
   * @param loginDto - Email và password
   * @returns JWT token (sẽ được set vào cookie ở controller)
   */
  async login(loginDto: LoginDto) {
    // Tìm user theo email (cần lấy cả password để so sánh)
    const user = await this.usersService.findByEmail(
      loginDto.email,
      true, // includePassword = true
    );

    // Nếu không tìm thấy user hoặc user không active → throw Unauthorized
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // So sánh password từ request với password đã hash trong database
    // bcrypt.compare() tự động hash password đầu vào và so sánh với hash trong DB
    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Tạo JWT payload (dữ liệu bên trong token)
    const payload = {
      sub: user._id.toString(), // sub = subject (thường là userId)
      email: user.email,
      roles: user.roles,
    };

    // Tạo JWT token với payload và secret
    // JwtService đã được cấu hình trong AuthModule với secret và expiresIn
    // Nên chỉ cần gọi sign() với payload, không cần truyền options lại
    const accessToken = this.jwtService.sign(payload);

    // Cập nhật thời gian đăng nhập cuối cùng
    await this.usersService.updateLastLogin(user._id.toString());

    // Trả về token (controller sẽ set vào cookie)
    return {
      accessToken,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        roles: user.roles,
        membership: user.membership,
      },
    };
  }

  /**
   * Xác thực user từ JWT (dùng trong guard)
   * @param userId - User ID từ JWT payload
   * @returns User document
   */
  async validateUser(userId: string) {
    return this.usersService.findOne(userId);
  }
}
