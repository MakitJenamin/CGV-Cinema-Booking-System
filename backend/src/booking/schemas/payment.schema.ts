// Payment Schema - Giao dịch thanh toán
// Mỗi payment đại diện cho 1 lần thanh toán (có thể mua nhiều vé trong 1 payment)

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PaymentDocument = Payment & Document;

// Interface cho breakdown của discount (giảm giá)
interface DiscountBreakdown {
  type: 'MEMBERSHIP' | 'PROMO' | 'VOUCHER'; // Loại giảm giá
  tier?: string; // Membership tier (nếu type = MEMBERSHIP)
  code?: string; // Mã khuyến mãi/voucher (nếu type = PROMO/VOUCHER)
  amount: number; // Số tiền giảm (VND)
}

// Interface cho breakdown của fees (phí)
interface FeeBreakdown {
  name: string; // Tên phí (VD: "Convenience Fee")
  amount: number; // Số tiền phí (VND)
}

// Interface cho tax (thuế)
interface TaxBreakdown {
  name: string; // Tên thuế (VD: "VAT 8%")
  amount: number; // Số tiền thuế (VND)
}

// Snapshot ghế được thanh toán trong payment (để webhook dùng phát hành vé)
interface SeatSnapshot {
  seatId: Types.ObjectId;
  seatRow: string;
  seatNumber: number;
}

@Schema({
  timestamps: true, // Tự động thêm createdAt và updatedAt
  collection: 'payments',
})
export class Payment {
  // User thanh toán
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  // Mã khuyến mãi đã dùng (nếu có)
  @Prop()
  promoCode?: string;

  // Tổng số tiền thanh toán (sau khi áp dụng tất cả discount, fee, tax, rounding)
  @Prop({ required: true })
  amount: number; // VND

  // Đơn vị tiền tệ
  @Prop({ default: 'VND' })
  currency: string;

  // Nhà cung cấp thanh toán (VD: vnpay, momo, zalopay, credit_card)
  @Prop({ required: true })
  provider: string;

  // Phương thức thanh toán (VD: qr, card, wallet)
  @Prop({ required: true })
  paymentMethod: string;

  // Trạng thái thanh toán
  @Prop({
    type: String,
    enum: ['pending', 'success', 'failed', 'refunded'],
    default: 'pending',
  })
  status: 'pending' | 'success' | 'failed' | 'refunded';

  // Transaction ID từ payment gateway (để tra cứu sau)
  @Prop()
  transactionId?: string;

  // Thời gian thanh toán thành công
  @Prop({ type: Date })
  paidAt?: Date;

  // Mã đơn hàng gửi sang cổng thanh toán (orderCode)
  @Prop()
  orderCode?: string;

  // URL QR (nếu thanh toán QR / e-wallet)
  @Prop()
  qrUrl?: string;

  // URL checkout (nếu thanh toán thẻ)
  @Prop()
  checkoutUrl?: string;

  // Show mà payment này áp dụng (để cập nhật seatStates / tạo tickets)
  @Prop({ type: Types.ObjectId, ref: 'Show' })
  showId?: Types.ObjectId;

  // Snapshot danh sách ghế được thanh toán (phục vụ webhook finalize)
  @Prop({ type: Array, default: [] })
  seats?: SeatSnapshot[];

  // Chi tiết các khoản giảm giá (để hiển thị breakdown)
  @Prop({ type: Array, default: [] })
  discountBreakdown: DiscountBreakdown[];

  // Chi tiết các khoản phí (để hiển thị breakdown)
  @Prop({ type: Array, default: [] })
  fees: FeeBreakdown[];

  // Chi tiết thuế (để hiển thị breakdown)
  @Prop({ type: Object })
  tax?: TaxBreakdown;

  // Số tiền chênh lệch do làm tròn (để audit)
  @Prop()
  roundedDelta?: number;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

// Index để query nhanh theo userId, status, transactionId
PaymentSchema.index({ userId: 1, status: 1 });
PaymentSchema.index({ transactionId: 1 });
