// ReservedTicket Schema - Vé đặt trước (để khách đến quầy thanh toán)
// Logic: User chọn ghế → ấn "Đặt trước" → tạo reservedTickets
// Vé được giữ đến 30 phút TRƯỚC KHI suất chiếu bắt đầu
// Nếu quá thời gian → tự động hủy và chuyển ghế về available

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReservedTicketDocument = ReservedTicket & Document;

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

  // Ghế đã chọn
  @Prop({ type: Types.ObjectId, ref: 'Seat', required: true })
  seatId: Types.ObjectId;

  // Thông tin ghế (để hiển thị nhanh, không cần join)
  @Prop({ required: true })
  seatRow: string; // VD: "A"

  @Prop({ required: true })
  seatNumber: number; // VD: 1

  // Mã đặt chỗ (để khách đến quầy thanh toán)
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
