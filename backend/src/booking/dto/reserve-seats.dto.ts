// ReserveSeatsDto - Dữ liệu khi user ấn "Đặt trước" cho nhiều ghế cùng lúc

import {
  IsNotEmpty,
  IsMongoId,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// Interface cho thông tin 1 ghế trong mảng
class SeatInfo {
  // ID của ghế muốn đặt
  @IsNotEmpty()
  @IsMongoId()
  seatId: string;

  // Thông tin ghế (để hiển thị nhanh)
  @IsNotEmpty()
  seatRow: string; // VD: "A"

  @IsNotEmpty()
  seatNumber: number; // VD: 1
}

export class ReserveSeatsDto {
  // ID của suất chiếu
  @IsNotEmpty()
  @IsMongoId()
  showId: string;

  // Mảng các ghế muốn đặt trước
  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeatInfo)
  seats: SeatInfo[];
}
