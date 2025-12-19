// ReservedTicket Schema - Vé đặt trước (để khách đến quầy thanh toán)
// Logic: User chọn nhiều ghế → ấn "Đặt trước" → tạo 1 reservedTicket với mảng seats
// Vé được giữ đến 30 phút TRƯỚC KHI suất chiếu bắt đầu
// Nếu quá thời gian → tự động hủy và chuyển ghế về available

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReservedTicketDocument = ReservedTicket & Document;

// Interface cho thông tin 1 ghế trong mảng seats
interface SeatInfo {
  seatId: Types.ObjectId; // ID của ghế (từ collection seats)
  seatRow: string; // Row của ghế (VD: "A")
  seatNumber: number; // Số ghế trong row (VD: 1)
}

@Schema({
  timestamps: true,
  collection: 'reservedTickets',
})
export class ReservedTicket {
  // User đặt vé
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  // Suất chiếu
  @Prop({ type: Types.ObjectId, ref: 'Show', required: true })
  showId: Types.ObjectId;

  // Mảng các ghế đã chọn (thay vì 1 ghế riêng lẻ)
  // Mỗi phần tử chứa: seatId, seatRow, seatNumber
  @Prop({
    type: [
      {
        seatId: { type: Types.ObjectId, ref: 'Seat', required: true },
        seatRow: { type: String, required: true },
        seatNumber: { type: Number, required: true },
      },
    ],
    required: true,
  })
  seats: SeatInfo[];

  // Mã đặt chỗ (để khách đến quầy thanh toán)
  // 1 mã đặt chỗ cho tất cả ghế trong mảng seats
  @Prop({ required: true, unique: true })
  reservationCode: string; // VD: "RSV-8F3K9Q"

  // Thời gian hết hạn = show.startTime - 30 phút
  // Nếu quá thời gian này → tự động hủy
  @Prop({ type: Date, required: true, index: true })
  reservedUntil: Date;

  // Trạng thái: reserved (đang giữ) | expired (hết hạn) | cancelled (bị hủy) | paid (đã thanh toán)
  @Prop({
    enum: ['reserved', 'expired', 'cancelled', 'paid'],
    default: 'reserved',
    index: true,
  })
  status: 'reserved' | 'expired' | 'cancelled' | 'paid';

  // Kênh đặt: online (web/app) | offline (quầy)
  @Prop({ enum: ['online', 'offline'], default: 'online' })
  channel: 'online' | 'offline';
}

export const ReservedTicketSchema =
  SchemaFactory.createForClass(ReservedTicket);

// Index để query nhanh các reservedTickets sắp hết hạn
ReservedTicketSchema.index({ reservedUntil: 1, status: 1 });
