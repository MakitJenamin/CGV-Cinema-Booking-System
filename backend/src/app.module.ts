// AppModule là root module của ứng dụng NestJS.
// Ở đây chúng ta cấu hình các module toàn cục: Config, Mongoose, Redis cache...

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';
import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { BookingModule } from './booking/booking.module';
import { MoviesModule } from './catalog/movies/movies.module';
import { ScreensModule } from './catalog/screens/screens.module';
import { SeatsModule } from './catalog/seats/seats.module';
import { ShowsModule } from './catalog/shows/shows.module';

@Module({
  imports: [
    // ConfigModule đọc biến môi trường (.env) và cho phép inject ConfigService ở mọi nơi
    ConfigModule.forRoot({
      isGlobal: true, // true = không cần import ConfigModule lại trong các module khác
      load: [configuration], // gọi hàm configuration() để gộp config custom
      validate, // gọi hàm validate để kiểm tra .env hợp lệ trước khi chạy app
    }),
    // MongooseModule kết nối tới MongoDB Atlas (database rapPhim)
    MongooseModule.forRootAsync({
      // useFactory cho phép inject ConfigService để đọc URI từ config
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('database.uri'),
      }),
      inject: [ConfigService],
    }),
    // CacheModule thiết lập cache toàn cục dùng Redis làm backend
    CacheModule.registerAsync({
      isGlobal: true, // cho phép dùng CacheModule ở mọi nơi mà không cần import lại
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        // redisStore tạo ra store kết nối đến Redis dựa trên REDIS_URL
        store: await redisStore({
          url: configService.get<string>('redis.url'),
        }),
      }),
    }),
    // Import các module nghiệp vụ
    UsersModule,
    AuthModule,
    BookingModule,
    MoviesModule,
    ScreensModule,
    SeatsModule,
    ShowsModule,
  ],
  // AppController chỉ là controller demo mặc định của Nest (có thể xoá/đổi sau)
  controllers: [AppController],
  // AppService là service demo tương ứng
  providers: [AppService],
})
export class AppModule {}
