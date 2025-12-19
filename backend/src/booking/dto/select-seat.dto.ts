// SelectSeatDto - Dữ liệu khi user click chọn ghế (bắt đầu selecting)
// DTO này dùng để validate dữ liệu đầu vào từ client
// Client sẽ gửi mảng SelectSeatDto[] - mỗi phần tử là 1 ghế đang chọn

import { IsNotEmpty, IsMongoId, IsString } from 'class-validator';

export class SelectSeatDto {
  // ID của suất chiếu (show) mà user muốn chọn ghế
  @IsNotEmpty() // Không được để trống
  @IsMongoId() // Phải là MongoDB ObjectId hợp lệ
  showId: string;

  // ID của ghế muốn chọn (từ collection seats)
  @IsNotEmpty()
  @IsMongoId()
  seatId: string;

  // Row của ghế (ví dụ: "A", "B", "C") - dùng để tạo key trong seatStates
  @IsNotEmpty()
  @IsString() // Phải là string
  seatRow: string;

  // Số ghế trong row (ví dụ: 1, 2, 3) - dùng để tạo key trong seatStates
  @IsNotEmpty()
  seatNumber: number;
}
