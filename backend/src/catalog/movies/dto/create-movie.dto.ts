// DTO tạo mới Movie
// Dùng class-validator để đảm bảo dữ liệu hợp lệ
import { IsNotEmpty, IsOptional, IsString, IsNumber } from 'class-validator';

export class CreateMovieDto {
  // Tên phim (bắt buộc)
  @IsNotEmpty()
  @IsString()
  title: string;

  // Tên tiếng Anh (tuỳ chọn)
  @IsOptional()
  @IsString()
  titleEn?: string;

  // Thời lượng phút (tuỳ chọn)
  @IsOptional()
  @IsNumber()
  duration?: number;

  // Giới hạn độ tuổi (PG-13, T18...) (tuỳ chọn)
  @IsOptional()
  @IsString()
  rating?: string;

  // Poster URL (tuỳ chọn)
  @IsOptional()
  @IsString()
  posterUrl?: string;

  // Giá gốc (basePrice) (tuỳ chọn)
  @IsOptional()
  @IsNumber()
  basePrice?: number;
}
