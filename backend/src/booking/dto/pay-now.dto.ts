// PayNowDto - Dữ liệu khi user thanh toán ngay (không qua reservedTicket)
// DTO này dùng để validate dữ liệu đầu vào từ client

import {
  IsNotEmpty,
  IsMongoId,
  IsString,
  IsEnum,
  IsOptional,
} from 'class-validator';

// Enum định nghĩa các phương thức thanh toán hợp lệ
export enum PaymentMethod {
  CREDIT_CARD = 'credit_card', // Thẻ tín dụng
  DEBIT_CARD = 'debit_card', // Thẻ ghi nợ
  CASH = 'cash', // Tiền mặt (nếu thanh toán tại quầy)
  E_WALLET = 'e_wallet', // Ví điện tử
}

export class PayNowDto {
  // ID của suất chiếu (show)
  @IsNotEmpty()
  @IsMongoId()
  showId: string;

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

  // Phương thức thanh toán (phải là một trong các giá trị của PaymentMethod enum)
  @IsNotEmpty()
  @IsEnum(PaymentMethod) // Chỉ chấp nhận các giá trị trong enum PaymentMethod
  paymentMethod: PaymentMethod;

  // Mã voucher (tuỳ chọn, user có thể nhập mã giảm giá)
  @IsOptional() // Không bắt buộc
  @IsString()
  voucherCode?: string;

  // Quote ID (tuỳ chọn, để validate giá đã quote trước đó)
  @IsOptional()
  @IsString()
  quoteId?: string;
}
