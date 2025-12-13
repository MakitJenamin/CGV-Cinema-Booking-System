// AuthModule quản lý authentication và authorization

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    // Import UsersModule để dùng UsersService trong AuthService
    UsersModule,
    // PassportModule đăng ký Passport (cần cho JwtStrategy)
    PassportModule,
    // JwtModule đăng ký JwtService (dùng để tạo/verify JWT)
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('auth.jwt.accessSecret');
        if (!secret) {
          throw new Error('JWT_ACCESS_SECRET is required');
        }
        const expiresIn =
          configService.get<string>('auth.jwt.accessExpiresIn') || '15m';
        return {
          secret,
          signOptions: {
            expiresIn: expiresIn as any, // Type assertion để tránh lỗi type với StringValue
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy], // JwtStrategy là Passport strategy
  exports: [AuthService, PassportModule], // Export PassportModule để module khác dùng JwtAuthGuard
})
export class AuthModule {}
