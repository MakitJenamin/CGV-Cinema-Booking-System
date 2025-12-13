// DTO tạo mới show (suất chiếu)
import {
  IsNotEmpty,
  IsMongoId,
  IsOptional,
  IsString,
  IsDateString,
} from 'class-validator';

export class CreateShowDto {
  // Phim chiếu
  @IsNotEmpty()
  @IsMongoId()
  movieId: string;

  // Phòng chiếu
  @IsNotEmpty()
  @IsMongoId()
  screenId: string;

  // Định dạng màn (tuỳ chọn)
  @IsOptional()
  @IsMongoId()
  screenFormatId?: string;

  // Mã định dạng màn (2D/IMAX/4DX...) (tuỳ chọn)
  @IsOptional()
  @IsString()
  screenFormatCode?: string;

  // Thời gian bắt đầu (ISO string)
  @IsNotEmpty()
  @IsDateString()
  startTime: string;

  // Thời gian kết thúc (ISO string)
  @IsNotEmpty()
  @IsDateString()
  endTime: string;
}
