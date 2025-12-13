// PricingAudit Schema - Audit log chi tiết quá trình tính giá
// Lưu lại từng bước trong pipeline tính giá để debug/audit

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PricingAuditDocument = PricingAudit & Document;

// Interface cho từng bước trong pipeline tính giá
interface PipelineStep {
  step: string; // Tên bước (VD: "movieBase", "seatType", "membership", "tax")
  amount: number; // Số tiền thay đổi (có thể âm nếu là discount)
  meta?: Record<string, any>; // Metadata bổ sung (VD: movieId, seatTypeCode, tier, code)
}

// Interface cho thông tin ghế trong audit
interface SeatInfo {
  seatId: Types.ObjectId; // ID của ghế
  type?: string; // Loại ghế (VD: "vip")
}

@Schema({
  timestamps: true, // Tự động thêm createdAt và updatedAt
  collection: 'pricingAudits',
})
export class PricingAudit {
  // Quote ID liên quan (nếu có)
  @Prop({ index: true })
  quoteId?: string;

  // User yêu cầu tính giá
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  // Show (suất chiếu)
  @Prop({ type: Types.ObjectId, ref: 'Show', required: true })
  showId: Types.ObjectId;

  // Danh sách ghế được tính giá
  @Prop({ type: Array, required: true })
  seats: SeatInfo[];

  // Pipeline chi tiết từng bước tính giá
  // Mỗi step ghi lại: tên bước, số tiền thay đổi, metadata
  @Prop({ type: Array, required: true })
  pipeline: PipelineStep[];

  // Giá ban đầu (basePrice)
  @Prop({ required: true })
  priceBefore: number; // VND

  // Giá cuối cùng (sau khi áp dụng tất cả)
  @Prop({ required: true })
  priceAfter: number; // VND
}

export const PricingAuditSchema = SchemaFactory.createForClass(PricingAudit);

// Index để query nhanh theo userId, showId, quoteId
PricingAuditSchema.index({ userId: 1, showId: 1 });
PricingAuditSchema.index({ quoteId: 1 });
