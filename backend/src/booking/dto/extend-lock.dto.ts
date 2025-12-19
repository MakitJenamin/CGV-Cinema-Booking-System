// ExtendLockDto - Dữ liệu để gia hạn Redis lock thêm 5 phút khi vào Phase 2
// DTO này dùng để validate dữ liệu đầu vào từ client
// Client gửi mảng các ghế đang chọn để gia hạn lock cho tất cả

import {
  IsNotEmpty,
  IsMongoId,
  IsString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// Interface cho thông tin 1 ghế trong mảng
class SeatInfo {
  // Row của ghế (ví dụ: "A")
  @IsNotEmpty()
  @IsString()
  seatRow: string;

  // Số ghế trong row (ví dụ: 1)
  @IsNotEmpty()
  seatNumber: number;
}

export class ExtendLockDto {
  // ID của suất chiếu (show)
  @IsNotEmpty()
  @IsMongoId()
  showId: string;

  // Mảng các ghế đang chọn cần gia hạn lock (tối thiểu 1 ghế)
  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeatInfo)
  seats: SeatInfo[];
}
