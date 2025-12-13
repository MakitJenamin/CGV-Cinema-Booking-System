// Ticket Schema - Vé đã được bán
// Mỗi ticket đại diện cho 1 ghế đã được thanh toán thành công

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TicketDocument = Ticket & Document;

@Schema({
  timestamps: true, // Tự động thêm createdAt và updatedAt
  collection: 'tickets',
})
export class Ticket {
  // Payment record liên quan (1 payment có thể có nhiều tickets nếu mua nhiều ghế)
  @Prop({ type: Types.ObjectId, ref: 'Payment', required: true })
  paymentId: Types.ObjectId;

  // User mua vé
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  // Show (suất chiếu) mà vé này thuộc về
  @Prop({ type: Types.ObjectId, ref: 'Show', required: true })
  showId: Types.ObjectId;

  // Ghế đã mua
  @Prop({ type: Types.ObjectId, ref: 'Seat', required: true })
  seatId: Types.ObjectId;

  // Thông tin ghế (để hiển thị nhanh, không cần join)
  @Prop({ required: true })
  seatRow: string; // VD: "A"

  @Prop({ required: true })
  seatNumber: number; // VD: 1

  // QR code để check-in tại rạp (unique, dùng để scan)
  @Prop({ required: true, unique: true, index: true })
  qrCode: string; // VD: "CGV202510251234567"

  // Trạng thái vé
  @Prop({
    type: String,
    enum: ['active', 'used', 'refunded'],
    default: 'active',
  })
  status: 'active' | 'used' | 'refunded';

  // Thời gian check-in tại rạp (null nếu chưa check-in)
  @Prop({ type: Date })
  checkedInAt?: Date;

  // Thời gian phát hành vé (khi thanh toán thành công)
  @Prop({ type: Date, default: Date.now })
  issuedAt: Date;
}

export const TicketSchema = SchemaFactory.createForClass(Ticket);

// Index để query nhanh theo userId, showId, status
TicketSchema.index({ userId: 1, status: 1 });
TicketSchema.index({ showId: 1, seatId: 1 });
