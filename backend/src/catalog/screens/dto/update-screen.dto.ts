// DTO cập nhật Screen - tất cả field tuỳ chọn
import { IsOptional, IsString, IsMongoId, IsNumber } from 'class-validator';

export class UpdateScreenDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsMongoId()
  theaterId?: string;

  @IsOptional()
  @IsNumber()
  capacity?: number;

  @IsOptional()
  @IsMongoId()
  screenFormatId?: string;

  @IsOptional()
  @IsString()
  screenFormatCode?: string;
}
