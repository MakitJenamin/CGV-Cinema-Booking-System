// File này dùng để kiểm tra (validate) biến môi trường khi app khởi động.
// Nếu thiếu hoặc sai kiểu dữ liệu, app sẽ báo lỗi sớm, giúp bạn dễ debug hơn.

import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

// Khai báo enum cho NODE_ENV để giới hạn giá trị hợp lệ
enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

// Lớp này mô tả "hợp đồng" cho các biến môi trường mà app cần
class EnvironmentVariables {
  // NODE_ENV chỉ được phép là 1 trong 3 giá trị enum ở trên
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  // PORT phải là number, mặc định 3000 nếu không truyền
  @IsNumber()
  PORT: number = 3000;

  // Chuỗi URI kết nối MongoDB bắt buộc phải có, không được rỗng
  @IsString()
  @IsNotEmpty()
  MONGODB_URI: string;

  // Chuỗi URL kết nối Redis bắt buộc phải có
  @IsString()
  @IsNotEmpty()
  REDIS_URL: string;

  // Secret để ký JWT bắt buộc phải có
  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_SECRET: string;

  // Thời gian hết hạn của access token (VD: '15m'), có thể bỏ qua sẽ dùng default
  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRES?: string = '15m';

  // Domain áp dụng cho cookie
  @IsString()
  COOKIE_DOMAIN: string = 'localhost';

  // Có bật cookie secure hay không (true/false)
  @IsBoolean()
  COOKIE_SECURE: boolean = false;
}

// Hàm validate được ConfigModule gọi khi app khởi động
export function validate(config: Record<string, unknown>) {
  // Chuyển plain object (key/value từ process.env) thành instance của EnvironmentVariables
  const validated = plainToInstance(EnvironmentVariables, config, {
    // Tự động convert kiểu (VD: '3000' -> 3000)
    enableImplicitConversion: true,
  });

  // Dùng class-validator để kiểm tra tất cả field theo rule ở trên
  const errors = validateSync(validated, {
    // Không cho phép bỏ qua property bắt buộc
    skipMissingProperties: false,
  });

  // Nếu có lỗi, gom message lại thành 1 chuỗi và ném ra Error
  if (errors.length > 0) {
    throw new Error(
      `Config validation error: ${errors
        .map((error) => Object.values(error.constraints ?? {}).join(', '))
        .join('; ')}`,
    );
  }

  // Nếu hợp lệ, trả về object đã validate để Nest dùng tiếp
  return validated;
}
