// UsersModule là module quản lý tất cả components liên quan đến User
// Module này cần được import vào AppModule để Nest biết và sử dụng

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User, UserSchema } from './schemas/user.schema';

@Module({
  // MongooseModule.forFeature() đăng ký User schema với Mongoose
  // Sau đó có thể inject User model vào UsersService bằng @InjectModel(User.name)
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  // Controllers xử lý HTTP requests
  controllers: [UsersController],
  // Providers (Services) chứa business logic, có thể inject vào controller hoặc service khác
  providers: [UsersService],
  // exports: [UsersService] - nếu muốn dùng UsersService ở module khác (ví dụ AuthModule)
  // Hiện tại chưa export vì chưa cần, nhưng sau này AuthModule sẽ cần
  exports: [UsersService],
})
export class UsersModule {}
