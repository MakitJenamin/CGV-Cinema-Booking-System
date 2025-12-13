// File main.ts là entrypoint của ứng dụng NestJS.
// Hàm bootstrap() sẽ được gọi đầu tiên để khởi động app.

import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  // Tạo instance ứng dụng Nest sử dụng AppModule làm root module
  const app = await NestFactory.create(AppModule);

  // Bật Helmet để thêm các HTTP header bảo mật (chống một số kiểu tấn công phổ biến)
  app.use(helmet());

  // Dùng cookie-parser để Nest có thể đọc/ghi cookie từ request/response
  app.use(cookieParser());

  // Global ValidationPipe:
  // - tự động validate DTO theo class-validator
  // - loại bỏ field thừa không khai báo trong DTO (whitelist)
  // - tự convert kiểu dữ liệu (string -> number, v.v.)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Lấy ConfigService từ DI container để đọc cấu hình đã định nghĩa ở configuration.ts
  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') ?? 3000;

  // Bắt đầu lắng nghe HTTP trên port đã cấu hình
  await app.listen(port);
}

// Logger dùng để log lỗi nếu quá trình khởi động thất bại
const logger = new Logger('Bootstrap');

// Gọi hàm bootstrap và bắt lỗi nếu có (VD: kết nối DB thất bại)
bootstrap().catch((error) => {
  logger.error('Failed to bootstrap application', error);
  process.exit(1);
});
