// Redis Provider - Cung cấp Redis client để dùng trong BookingModule
// Dùng ioredis để thực hiện các lệnh Redis trực tiếp (SET, GET, DEL, v.v.)

import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

// Tạo provider function để inject Redis client
export const REDIS_CLIENT = 'REDIS_CLIENT'; // Token để inject

export const redisProvider: Provider = {
  // Token này dùng để inject Redis client ở nơi khác
  provide: REDIS_CLIENT,
  // useFactory là hàm được gọi khi NestJS cần tạo instance của provider này
  useFactory: (configService: ConfigService): Redis => {
    // Lấy REDIS_URL từ ConfigService (đã được load từ .env)
    const redisUrl = configService.get<string>('redis.url');

    // Nếu thiếu REDIS_URL thì throw sớm để dev biết cấu hình chưa đúng
    if (!redisUrl) {
      throw new Error('REDIS_URL is not defined. Please set it in your .env');
    }

    // Tạo Redis client mới với URL từ config
    // ioredis tự động parse URL và kết nối
    const redis = new Redis(redisUrl, {
      // Cấu hình thêm nếu cần:
      // maxRetriesPerRequest: 3, // Số lần retry khi lỗi
      // retryStrategy: (times) => Math.min(times * 50, 2000), // Chiến lược retry
    });

    // Log khi kết nối thành công (optional, để debug)
    redis.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });

    // Log khi có lỗi kết nối (optional, để debug)
    redis.on('error', (err) => {
      console.error('❌ Redis connection error:', err);
    });

    // Trả về Redis client để NestJS inject vào các service
    return redis;
  },
  // inject: [ConfigService] nghĩa là NestJS sẽ inject ConfigService vào useFactory
  inject: [ConfigService],
};
