// Seat Schema - đại diện cho ghế trong một phòng chiếu
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SeatDocument = Seat & Document;

@Schema({ collection: 'seats', timestamps: false })
export class Seat {
  // Ghế thuộc phòng nào
  @Prop({ type: Types.ObjectId, ref: 'Screen', required: true })
  screenId: Types.ObjectId;

  // Hàng ghế, ví dụ "A", "B"
  @Prop({ required: true })
  row: string;

  // Số ghế trong hàng
  @Prop({ required: true })
  number: number;

  // Loại ghế (ref seatTypes) để tính surcharge/legend
  @Prop({ type: Types.ObjectId, ref: 'SeatType' })
  seatTypeId?: Types.ObjectId;

  // Mã loại ghế (để đọc nhanh ở FE, không cần join)
  @Prop()
  seatTypeCode?: string;

  // Trạng thái hoạt động của ghế (ẩn/hiện)
  @Prop({ default: true })
  isActive: boolean;
}

export const SeatSchema = SchemaFactory.createForClass(Seat);
