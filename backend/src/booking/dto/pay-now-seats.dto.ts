// PayNowSeatsDto - Dữ liệu khi user thanh toán ngay cho nhiều ghế cùng lúc (không qua reservedTicket)
// DTO này dùng để validate dữ liệu đầu vào từ client khi thanh toán nhiều ghế

import {
  IsNotEmpty,
  IsMongoId,
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// Enum định nghĩa các phương thức thanh toán hợp lệ
export enum PaymentMethod {
  CREDIT_CARD = 'credit_card', // Thẻ tín dụng
  DEBIT_CARD = 'debit_card', // Thẻ ghi nợ
  CASH = 'cash', // Tiền mặt (nếu thanh toán tại quầy)
  E_WALLET = 'e_wallet', // Ví điện tử
}

// Interface cho thông tin 1 ghế trong mảng
class SeatInfo {
  // ID của ghế muốn thanh toán
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

export class PayNowSeatsDto {
  // ID của suất chiếu (show)
  @IsNotEmpty()
  @IsMongoId()
  showId: string;

  // Mảng các ghế muốn thanh toán (tối thiểu 1 ghế)
  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeatInfo)
  seats: SeatInfo[];

  // Phương thức thanh toán (phải là một trong các giá trị của PaymentMethod enum)
  @IsNotEmpty()
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  // Mã voucher (tuỳ chọn, user có thể nhập mã giảm giá)
  @IsOptional()
  @IsString()
  voucherCode?: string;

  // Quote ID (tuỳ chọn, để validate giá đã quote trước đó)
  @IsOptional()
  @IsString()
  quoteId?: string;

  // Return URL (tuỳ chọn, URL FE nhận kết quả sau khi thanh toán xong)
  // Nếu không có, BE sẽ dùng default URL
  @IsOptional()
  @IsString()
  returnUrl?: string;
}
