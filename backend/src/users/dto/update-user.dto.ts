// UpdateUserDto dùng khi cập nhật thông tin user
// Tất cả field đều optional (có thể chỉ update 1 vài field)

import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @Matches(/^(\+84|0)[0-9]{9}$/, {
    message: 'Phone must be a valid Vietnamese phone number',
  })
  phone?: string;

  @IsOptional()
  dateOfBirth?: Date;

  @IsOptional()
  @IsEnum(['male', 'female', 'other'])
  gender?: 'male' | 'female' | 'other';

  @IsOptional()
  @IsEnum(['regular', 'gold', 'diamond'])
  membership?: 'regular' | 'gold' | 'diamond';

  @IsOptional()
  isActive?: boolean;
}
