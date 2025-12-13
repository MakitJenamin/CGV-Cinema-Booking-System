// DTO tạo ghế mới
import {
  IsNotEmpty,
  IsMongoId,
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class CreateSeatDto {
  // Thuộc phòng nào
  @IsNotEmpty()
  @IsMongoId()
  screenId: string;

  // Hàng ghế (A, B, C...)
  @IsNotEmpty()
  @IsString()
  row: string;

  // Số ghế trong hàng
  @IsNotEmpty()
  @IsNumber()
  number: number;

  // Loại ghế (tuỳ chọn)
  @IsOptional()
  @IsMongoId()
  seatTypeId?: string;

  // Mã loại ghế (tuỳ chọn)
  @IsOptional()
  @IsString()
  seatTypeCode?: string;

  // Trạng thái active (tuỳ chọn)
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
