// ReserveSeatDto - Dữ liệu khi user ấn "Đặt trước"

import { IsNotEmpty, IsMongoId } from 'class-validator';

export class ReserveSeatDto {
  // ID của suất chiếu
  @IsNotEmpty()
  @IsMongoId()
  showId: string;

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
