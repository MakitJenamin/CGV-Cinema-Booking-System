// JwtStrategy là Passport strategy để xác thực JWT token
// Khi client gửi request kèm JWT token (trong cookie), strategy này sẽ verify token

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    const secret = configService.get<string>('auth.jwt.accessSecret');
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is required');
    }
    super({
      // jwtFromRequest: ExtractJwt.fromExtractors([...]) - cách lấy JWT từ request
      // Ở đây ta lấy từ cookie có tên 'access_token'
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request) => {
          // request.cookies được parse bởi cookie-parser (đã cấu hình trong main.ts)
          return request?.cookies?.access_token;
        },
      ]),
      // secretOrKey: secret dùng để verify JWT (phải match với secret khi tạo token)
      secretOrKey: secret,
      // ignoreExpiration: false = kiểm tra token hết hạn
      ignoreExpiration: false,
    });
  }

  /**
   * Hàm này được Passport gọi sau khi verify JWT thành công
   * @param payload - Nội dung của JWT (thường chứa userId, email, roles...)
   * @returns Object này sẽ được gán vào request.user (dùng trong controller/guard)
   */
  async validate(payload: any) {
    // payload thường có dạng: { sub: userId, email: '...', roles: [...] }
    // Tìm user trong database để đảm bảo user vẫn tồn tại và active
    const user = await this.usersService.findOne(payload.sub);

    if (!user || !user.isActive) {
      // Nếu user không tồn tại hoặc đã bị deactivate → throw Unauthorized
      throw new UnauthorizedException('User not found or inactive');
    }

    // Trả về object này → sẽ có trong request.user ở controller
    return {
      userId: user._id.toString(),
      email: user.email,
      roles: user.roles,
    };
  }
}
