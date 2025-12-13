// DTO tạo mới Screen (phòng chiếu)
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsMongoId,
  IsNumber,
} from 'class-validator';

export class CreateScreenDto {
  // Tên phòng chiếu
  @IsNotEmpty()
  @IsString()
  name: string;

  // Thuộc theater nào (đang dùng ObjectId placeholder, chưa có module theater)
  @IsNotEmpty()
  @IsMongoId()
  theaterId: string;

  // Sức chứa (tuỳ chọn)
  @IsOptional()
  @IsNumber()
  capacity?: number;

  // Định dạng màn hình (tuỳ chọn)
  @IsOptional()
  @IsMongoId()
  screenFormatId?: string;

  // Mã định dạng (2D/IMAX/4DX...) (tuỳ chọn)
  @IsOptional()
  @IsString()
  screenFormatCode?: string;
}
