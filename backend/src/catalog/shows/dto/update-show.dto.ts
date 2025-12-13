// DTO cập nhật show - tất cả field tuỳ chọn
import {
  IsOptional,
  IsMongoId,
  IsString,
  IsDateString,
  IsBoolean,
} from 'class-validator';

export class UpdateShowDto {
  @IsOptional()
  @IsMongoId()
  movieId?: string;

  @IsOptional()
  @IsMongoId()
  screenId?: string;

  @IsOptional()
  @IsMongoId()
  screenFormatId?: string;

  @IsOptional()
  @IsString()
  screenFormatCode?: string;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
