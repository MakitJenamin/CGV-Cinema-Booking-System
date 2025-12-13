// PayReservationDto - Dữ liệu khi staff thanh toán reservedTicket tại quầy

import { IsNotEmpty, IsString } from 'class-validator';

export class PayReservationDto {
  // Mã đặt chỗ (reservationCode) mà khách đưa cho staff
  @IsNotEmpty()
  @IsString()
  reservationCode: string;

  // Phương thức thanh toán (tại quầy thường là cash hoặc card)
  @IsNotEmpty()
  @IsString()
  paymentMethod: string; // VD: "cash", "card"
}
