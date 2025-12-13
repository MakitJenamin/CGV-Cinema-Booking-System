// DTO cập nhật ghế - tất cả field tuỳ chọn
import {
  IsOptional,
  IsMongoId,
  IsString,
  IsNumber,
  IsBoolean,
} from 'class-validator';

export class UpdateSeatDto {
  @IsOptional()
  @IsMongoId()
  screenId?: string;

  @IsOptional()
  @IsString()
  row?: string;

  @IsOptional()
  @IsNumber()
  number?: number;

  @IsOptional()
  @IsMongoId()
  seatTypeId?: string;

  @IsOptional()
  @IsString()
  seatTypeCode?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
