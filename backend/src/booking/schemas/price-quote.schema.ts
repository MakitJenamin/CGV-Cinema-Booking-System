// PriceQuote Schema - Báo giá tạm thời (TTL 5-10 phút)
// Lưu snapshot giá để user có thời gian quyết định thanh toán

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PriceQuoteDocument = PriceQuote & Document;

// Interface cho breakdown từng bước tính giá
interface PriceBreakdown {
  type: string; // VD: "BASE", "SURCHARGE", "DISCOUNT", "TAX", "ROUNDING"
  label: string; // Tên hiển thị (VD: "Ghế VIP", "VAT 8%")
  amount: number; // Số tiền (có thể âm nếu là discount)
  meta?: Record<string, any>; // Metadata bổ sung (optional)
}

@Schema({
  timestamps: true, // Tự động thêm createdAt và updatedAt
  collection: 'priceQuotes',
})
export class PriceQuote {
  // Quote ID duy nhất (format: Q-YYYYMMDD-XXXXXX)
  @Prop({ required: true, unique: true, index: true })
  quoteId: string; // VD: "Q-20251031-000777"

  // Mode: "full" = quote đầy đủ với tất cả discounts
  @Prop({ default: 'full' })
  mode: string;

  // User yêu cầu quote
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  // Show (suất chiếu)
  @Prop({ type: Types.ObjectId, ref: 'Show', required: true })
  showId: Types.ObjectId;

  // Danh sách seat IDs (có thể mua nhiều ghế trong 1 quote)
  @Prop({ type: [Types.ObjectId], required: true })
  seats: Types.ObjectId[];

  // Tổng giá cuối cùng (sau khi áp dụng tất cả)
  @Prop({ required: true })
  price: number; // VND

  // Breakdown chi tiết từng bước tính giá
  @Prop({ type: Array, required: true })
  breakdown: PriceBreakdown[];

  // Thời gian hết hạn (TTL 5-10 phút, sau đó quote không còn hợp lệ)
  @Prop({ type: Date, required: true, index: true })
  expiresAt: Date;
}

export const PriceQuoteSchema = SchemaFactory.createForClass(PriceQuote);

// Index để query nhanh theo userId, showId, expiresAt
PriceQuoteSchema.index({ userId: 1, showId: 1 });
// TTL index: tự động xóa documents sau khi expiresAt
PriceQuoteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
