// CancelSelectingDto - Dữ liệu khi user bỏ chọn ghế (cancel selecting)
// DTO này dùng để validate dữ liệu đầu vào từ client

import { IsNotEmpty, IsMongoId, IsString } from 'class-validator';

export class CancelSelectingDto {
  // ID của suất chiếu (show)
  @IsNotEmpty()
  @IsMongoId()
  showId: string;

  // ID của ghế muốn bỏ chọn
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
