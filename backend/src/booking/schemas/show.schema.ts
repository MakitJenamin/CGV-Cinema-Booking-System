// Show Schema - Suất chiếu
// Mỗi show chứa thông tin: phim nào, phòng nào, giờ chiếu, trạng thái ghế

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ShowDocument = Show & Document;

// Interface cho trạng thái từng ghế trong show
interface SeatState {
  status: 'available' | 'held' | 'sold' | 'blocked';
  ticketId?: Types.ObjectId | null; // Khi sold
  reservedTicketId?: Types.ObjectId | null; // Khi held
  updatedAt: Date;
}

@Schema({
  timestamps: true,
  collection: 'shows',
})
export class Show {
  // Phim chiếu
  @Prop({ type: Types.ObjectId, ref: 'Movie', required: true })
  movieId: Types.ObjectId;

  // Phòng chiếu
  @Prop({ type: Types.ObjectId, ref: 'Screen', required: true })
  screenId: Types.ObjectId;

  // Định dạng màn hình (để filter nhanh, không cần join)
  @Prop({ type: Types.ObjectId, ref: 'ScreenFormat' })
  screenFormatId?: Types.ObjectId;

  @Prop()
  screenFormatCode?: string; // VD: "IMAX", "2D"

  // Trạng thái từng ghế trong phòng
  // Key: "A-1", "B-5" (row-number)
  // Value: { status, ticketId, reservedTicketId, updatedAt }
  @Prop({ type: Map, of: Object, default: {} })
  seatStates: Map<string, SeatState>;

  // Thời gian bắt đầu và kết thúc suất chiếu
  @Prop({ type: Date, required: true, index: true })
  startTime: Date;

  @Prop({ type: Date, required: true })
  endTime: Date;

  @Prop({ default: true })
  isActive: boolean;
}

export const ShowSchema = SchemaFactory.createForClass(Show);

// Index để query shows theo thời gian
ShowSchema.index({ startTime: 1, isActive: 1 });
