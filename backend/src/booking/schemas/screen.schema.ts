// Screen Schema - thông tin phòng chiếu
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ScreenDocument = Screen & Document;

@Schema({ collection: 'screens', timestamps: false })
export class Screen {
  // Tên phòng chiếu (IMAX Screen, Screen 01...)
  @Prop({ required: true })
  name: string;

  // Phòng thuộc rạp nào
  @Prop({ type: Types.ObjectId, ref: 'Theater', required: true })
  theaterId: Types.ObjectId;

  // Sức chứa ghế
  @Prop()
  capacity?: number;

  // Định dạng màn hình (ref screenFormats)
  @Prop()
  screenFormatId?: Types.ObjectId;

  // Mã định dạng màn (2D/IMAX/4DX...) để đọc nhanh
  @Prop()
  screenFormatCode?: string;
}

export const ScreenSchema = SchemaFactory.createForClass(Screen);
