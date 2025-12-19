// CalculatePriceBreakdownDto - Dữ liệu để tính breakdown giá chi tiết (Phase 2 - có voucher)
// DTO này dùng để validate dữ liệu đầu vào từ client khi user chọn voucher

import {
  IsNotEmpty,
  IsMongoId,
  IsArray,
  ValidateNested,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';

// Interface cho thông tin 1 ghế trong mảng
class SeatInfo {
  // ID của ghế muốn tính giá
  @IsNotEmpty()
  @IsMongoId()
  seatId: string;

  // Row của ghế (ví dụ: "A")
  @IsNotEmpty()
  @IsString()
  seatRow: string;

  // Số ghế trong row (ví dụ: 1)
  @IsNotEmpty()
  seatNumber: number;
}

export class CalculatePriceBreakdownDto {
  // ID của suất chiếu (show)
  @IsNotEmpty()
  @IsMongoId()
  showId: string;

  // Mảng các ghế muốn tính giá (tối thiểu 1 ghế)
  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeatInfo)
  seats: SeatInfo[];

  // Mã voucher (tuỳ chọn, user có thể nhập mã giảm giá)
  @IsOptional()
  @IsString()
  voucherCode?: string;
}
