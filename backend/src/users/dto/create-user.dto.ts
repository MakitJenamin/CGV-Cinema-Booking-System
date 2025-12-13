// CreateUserDto định nghĩa dữ liệu đầu vào khi tạo user mới
// class-validator sẽ tự động validate các field này trước khi vào controller

import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  Matches,
} from 'class-validator';

export class CreateUserDto {
  // @IsNotEmpty() = không được để trống
  // @IsString() = phải là chuỗi
  @IsNotEmpty()
  @IsString()
  name: string;

  // @IsEmail() = phải đúng format email (có @, domain...)
  @IsNotEmpty()
  @IsEmail()
  email: string;

  // @Matches() = phải match regex (số điện thoại VN: +84 hoặc 0 + 9 số)
  @IsNotEmpty()
  @Matches(/^(\+84|0)[0-9]{9}$/, {
    message: 'Phone must be a valid Vietnamese phone number',
  })
  phone: string;

  // @MinLength() = mật khẩu tối thiểu 6 ký tự
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  // @IsOptional() = có thể không có (không bắt buộc)
  @IsOptional()
  dateOfBirth?: Date;

  @IsOptional()
  @IsEnum(['male', 'female', 'other'])
  gender?: 'male' | 'female' | 'other';

  // membership mặc định là 'regular' nếu không truyền
  @IsOptional()
  @IsEnum(['regular', 'gold', 'diamond'])
  membership?: 'regular' | 'gold' | 'diamond';
}
