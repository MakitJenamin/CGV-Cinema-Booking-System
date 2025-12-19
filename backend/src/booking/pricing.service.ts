// PricingService - Service tính toán giá vé theo pipeline đầy đủ
// Xử lý: basePrice → surcharges → discounts → tax → rounding

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Movie, MovieDocument } from './schemas/movie.schema';
import { Seat, SeatDocument } from './schemas/seat.schema';
import { Screen, ScreenDocument } from './schemas/screen.schema';
import { Show, ShowDocument } from './schemas/show.schema';
import { Decimal } from 'decimal.js'; // Dùng decimal.js để tính toán chính xác (tránh lỗi floating point)

// Interface cho breakdown từng bước tính giá
export interface PriceBreakdown {
  type: string; // "BASE" | "SURCHARGE" | "DISCOUNT" | "TAX" | "ROUNDING"
  label: string; // Tên hiển thị
  amount: number; // Số tiền (có thể âm nếu là discount)
  meta?: Record<string, any>; // Metadata bổ sung
}

// Interface cho kết quả tính giá
export interface PricingResult {
  basePrice: number; // Giá gốc từ movie
  subtotal: number; // Tổng sau surcharges (Pha 1)
  totalDiscount: number; // Tổng discount (Pha 2)
  totalTax: number; // Tổng thuế (Pha 3)
  roundedDelta: number; // Chênh lệch do làm tròn (Pha 4)
  grandTotal: number; // Tổng cuối cùng
  breakdown: PriceBreakdown[]; // Chi tiết từng bước
}

@Injectable()
export class PricingService {
  constructor(
    // Inject các MongoDB models cần thiết
    @InjectModel(Movie.name) private movieModel: Model<MovieDocument>,
    @InjectModel(Seat.name) private seatModel: Model<SeatDocument>,
    @InjectModel(Screen.name) private screenModel: Model<ScreenDocument>,
    @InjectModel(Show.name) private showModel: Model<ShowDocument>,
  ) {}

  /**
   * Tính giá vé cho 1 hoặc nhiều ghế cùng lúc
   * @param showId - ID của show (suất chiếu)
   * @param seatIds - Mảng ID của các ghế (có thể là 1 hoặc nhiều ghế)
   * @param userId - ID của user (để lấy membership tier)
   * @param voucherCode - Mã voucher (optional) - chỉ áp dụng 1 lần cho toàn bộ đơn hàng nếu có nhiều ghế
   * @returns Kết quả tính giá với breakdown chi tiết
   */
  async calculatePrice(
    showId: string,
    seatIds: string[],
    userId: string,
    voucherCode?: string,
  ): Promise<PricingResult> {
    // ========== BƯỚC 1: VALIDATE ĐẦU VÀO ==========

    // 1.1. Validate mảng seatIds (tối thiểu 1 ghế)
    if (!seatIds || seatIds.length === 0) {
      throw new BadRequestException('At least one seat is required');
    }

    // 1.2. Lấy show để biết movieId, screenId, screenFormatCode, startTime
    const show = await this.showModel.findById(showId).lean().exec();
    if (!show || !show.isActive) {
      throw new NotFoundException('Show not found or inactive');
    }

    // 1.3. Lấy movie để lấy basePrice
    const movie = await this.movieModel.findById(show.movieId).lean().exec();
    if (!movie) {
      throw new NotFoundException('Movie not found');
    }

    // 1.4. Lấy screen để biết screenFormatCode, theaterId
    const screen = await this.screenModel.findById(show.screenId).lean().exec();
    if (!screen) {
      throw new NotFoundException('Screen not found');
    }

    // 1.5. TODO: Lấy user để biết membership tier (sẽ implement sau khi có users module)
    // const user = await this.userModel.findById(userId).lean().exec();
    // const membershipTier = user?.membership || 'regular';

    // Tạm thời dùng 'diamond' làm mặc định để test
    const membershipTier = 'diamond';

    // 1.6. Tính toán các giá trị chung (không phụ thuộc vào từng ghế)
    const showDate = new Date(show.startTime);
    const dayOfWeek = showDate.getDay(); // 0 = Sunday, 6 = Saturday
    const hour = showDate.getHours();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isEvening = hour >= 18 && hour < 24;

    // ========== BƯỚC 2: TÍNH GIÁ TỪNG GHẾ RIÊNG LẺ ==========

    // 2.1. Tính giá cho từng ghế riêng lẻ (không áp dụng voucher ở đây)
    // Voucher sẽ áp dụng sau khi tổng hợp giá tất cả ghế
    const perSeatResults: Array<{
      basePrice: number;
      subtotal: number;
      totalDiscount: number;
      breakdown: PriceBreakdown[];
    }> = [];

    for (const seatId of seatIds) {
      // 2.2. Lấy seat để biết seatTypeCode
      const seat = await this.seatModel.findById(seatId).lean().exec();
      if (!seat || !seat.isActive) {
        throw new NotFoundException(`Seat ${seatId} not found or inactive`);
      }

      // 2.3. Khởi tạo biến tính toán cho ghế này
      let currentPrice = new Decimal(movie.basePrice || 0);
      const seatBreakdown: PriceBreakdown[] = [];

      // 2.4. Thêm breakdown cho basePrice
      seatBreakdown.push({
        type: 'BASE',
        label: 'Giá gốc',
        amount: movie.basePrice || 0,
        meta: { movieId: movie._id.toString(), title: movie.title },
      });

      // 2.5. Seat Type Surcharge (phụ phí theo loại ghế)
      const seatTypeSurcharge = seat.seatTypeCode === 'vip' ? 20000 : 0;
      if (seatTypeSurcharge > 0) {
        currentPrice = currentPrice.plus(seatTypeSurcharge);
        seatBreakdown.push({
          type: 'SURCHARGE',
          label: `Ghế ${seat.seatTypeCode?.toUpperCase() || 'Standard'}`,
          amount: seatTypeSurcharge,
          meta: { seatTypeCode: seat.seatTypeCode },
        });
      }

      // 2.6. Screen Format Surcharge (phụ phí theo định dạng màn hình)
      const screenFormatSurcharge =
        show.screenFormatCode === 'IMAX' ? 30000 : 0;
      if (screenFormatSurcharge > 0) {
        currentPrice = currentPrice.plus(screenFormatSurcharge);
        seatBreakdown.push({
          type: 'SURCHARGE',
          label: `Màn hình ${show.screenFormatCode || '2D'}`,
          amount: screenFormatSurcharge,
          meta: {
            screenFormatCode: show.screenFormatCode,
          },
        });
      }

      // 2.7. Theater Surcharge (phụ phí theo rạp)
      const theaterSurcharge = 10000;
      if (theaterSurcharge > 0) {
        currentPrice = currentPrice.plus(theaterSurcharge);
        seatBreakdown.push({
          type: 'SURCHARGE',
          label: 'Phụ phí rạp',
          amount: theaterSurcharge,
          meta: { theaterId: screen.theaterId?.toString() },
        });
      }

      // 2.8. Time Slot Surcharge (phụ phí theo khung giờ)
      const timeSlotSurcharge = isWeekend && isEvening ? 10000 : 0;
      if (timeSlotSurcharge > 0) {
        currentPrice = currentPrice.plus(timeSlotSurcharge);
        seatBreakdown.push({
          type: 'SURCHARGE',
          label: 'Cuối tuần tối',
          amount: timeSlotSurcharge,
          meta: { dayType: 'weekend', timeRange: '18:00-23:59' },
        });
      }

      // 2.9. Lưu subtotal sau surcharges
      const subtotal = currentPrice.toNumber();

      // 2.10. Membership Discount (giảm giá theo hạng thành viên)
      let totalDiscount = new Decimal(0);
      if (membershipTier === 'diamond') {
        const membershipDiscountPercent = 15;
        const membershipDiscountAmount = currentPrice
          .times(membershipDiscountPercent)
          .dividedBy(100);
        const membershipDiscountMax = 50000;
        const membershipDiscount = Decimal.min(
          membershipDiscountAmount,
          membershipDiscountMax,
        );
        if (membershipDiscount.gt(0)) {
          currentPrice = currentPrice.minus(membershipDiscount);
          totalDiscount = totalDiscount.plus(membershipDiscount);
          seatBreakdown.push({
            type: 'DISCOUNT',
            label: `Thành viên ${membershipTier.toUpperCase()} -${membershipDiscountPercent}%`,
            amount: -membershipDiscount.toNumber(),
            meta: { tier: membershipTier, percent: membershipDiscountPercent },
          });
        }
      }

      // 2.11. Promotion (Auto-apply)
      if (isWeekend) {
        const promoPercent = 15;
        const promoDiscountAmount = currentPrice
          .times(promoPercent)
          .dividedBy(100);
        const promoDiscountMax = 20000;
        const promoDiscount = Decimal.min(
          promoDiscountAmount,
          promoDiscountMax,
        );
        if (promoDiscount.gt(0)) {
          currentPrice = currentPrice.minus(promoDiscount);
          totalDiscount = totalDiscount.plus(promoDiscount);
          seatBreakdown.push({
            type: 'DISCOUNT',
            label: 'Khuyến mãi WEEKEND15',
            amount: -promoDiscount.toNumber(),
            meta: { code: 'WEEKEND15', percent: promoPercent },
          });
        }
      }

      // 2.12. Lưu kết quả cho ghế này
      perSeatResults.push({
        basePrice: movie.basePrice || 0,
        subtotal: subtotal,
        totalDiscount: totalDiscount.toNumber(),
        breakdown: seatBreakdown,
      });
    }

    // ========== BƯỚC 3: TỔNG HỢP GIÁ TẤT CẢ GHẾ ==========

    // 3.1. Tính tổng basePrice (giá gốc của tất cả ghế)
    const totalBasePrice = perSeatResults.reduce(
      (sum, result) => sum + result.basePrice,
      0,
    );

    // 3.2. Tính tổng subtotal (sau surcharges)
    const totalSubtotal = perSeatResults.reduce(
      (sum, result) => sum + result.subtotal,
      0,
    );

    // 3.3. Tính tổng discount (từ membership và promo auto-apply)
    const totalDiscount = perSeatResults.reduce(
      (sum, result) => sum + result.totalDiscount,
      0,
    );

    // 3.4. Tính tổng giá sau discount (trước khi áp dụng voucher và tax)
    let currentTotal = new Decimal(totalSubtotal).minus(totalDiscount);

    // ========== BƯỚC 4: ÁP DỤNG VOUCHER (NẾU CÓ) ==========

    // 4.1. Voucher chỉ áp dụng 1 lần cho toàn bộ đơn hàng (không phải từng ghế)
    let voucherDiscount = new Decimal(0);
    if (voucherCode === 'MOVIE5K') {
      voucherDiscount = new Decimal(5000);
      currentTotal = currentTotal.minus(voucherDiscount);
    }

    // ========== BƯỚC 5: ÁP DỤNG TAX (THUẾ) ==========

    // 5.1. Tax (VAT) tính trên tổng giá sau discount (bao gồm voucher)
    const taxRate = 8; // 8%
    const totalTax = currentTotal.times(taxRate).dividedBy(100);
    currentTotal = currentTotal.plus(totalTax);

    // ========== BƯỚC 6: ROUNDING (LÀM TRÒN) ==========

    // 6.1. Rounding (làm tròn)
    const roundingStep = 1000;
    const roundedTotal = currentTotal
      .dividedBy(roundingStep)
      .round()
      .times(roundingStep);
    const roundedDelta = roundedTotal.minus(currentTotal);
    currentTotal = roundedTotal;

    // ========== BƯỚC 7: TẠO BREAKDOWN TỔNG HỢP ==========

    // 7.1. Tạo breakdown tổng hợp từ tất cả ghế
    const breakdown: PriceBreakdown[] = [];

    // Base price tổng hợp
    breakdown.push({
      type: 'BASE',
      label: `Giá gốc (${seatIds.length} ghế)`,
      amount: totalBasePrice,
      meta: { seatCount: seatIds.length },
    });

    // Tổng hợp tất cả surcharges từ các ghế
    const allSurcharges = perSeatResults.flatMap((result) =>
      result.breakdown.filter((item) => item.type === 'SURCHARGE'),
    );
    // Nhóm surcharges theo label để tránh trùng lặp
    const surchargeMap = new Map<string, number>();
    for (const surcharge of allSurcharges) {
      const key = surcharge.label;
      surchargeMap.set(key, (surchargeMap.get(key) || 0) + surcharge.amount);
    }
    // Thêm từng surcharge vào breakdown
    for (const [label, amount] of surchargeMap.entries()) {
      breakdown.push({
        type: 'SURCHARGE',
        label: label,
        amount: amount,
      });
    }

    // Tổng hợp tất cả discounts (membership + promo auto-apply) từ các ghế
    const allDiscounts = perSeatResults.flatMap((result) =>
      result.breakdown.filter((item) => item.type === 'DISCOUNT'),
    );
    // Nhóm discounts theo label
    const discountMap = new Map<string, number>();
    for (const discount of allDiscounts) {
      const key = discount.label;
      discountMap.set(
        key,
        (discountMap.get(key) || 0) + Math.abs(discount.amount),
      );
    }
    // Thêm từng discount vào breakdown
    for (const [label, amount] of discountMap.entries()) {
      breakdown.push({
        type: 'DISCOUNT',
        label: label,
        amount: -amount, // Âm vì là giảm giá
      });
    }

    // Voucher discount (nếu có)
    if (voucherDiscount.gt(0)) {
      breakdown.push({
        type: 'DISCOUNT',
        label: 'Voucher ' + voucherCode,
        amount: -voucherDiscount.toNumber(),
        meta: { code: voucherCode },
      });
    }

    // Tax
    breakdown.push({
      type: 'TAX',
      label: 'VAT 8%',
      amount: totalTax.toNumber(),
      meta: { ratePct: taxRate },
    });

    // Rounding (nếu có)
    if (roundedDelta.abs().gt(0)) {
      breakdown.push({
        type: 'ROUNDING',
        label: 'Làm tròn',
        amount: roundedDelta.toNumber(),
        meta: { mode: 'nearest', step: roundingStep },
      });
    }

    // ========== BƯỚC 8: TRẢ VỀ KẾT QUẢ ==========

    return {
      basePrice: totalBasePrice, // Tổng giá gốc
      subtotal: totalSubtotal, // Tổng sau surcharges
      totalDiscount: totalDiscount + voucherDiscount.toNumber(), // Tổng discount (membership + promo + voucher)
      totalTax: totalTax.toNumber(), // Tổng thuế
      roundedDelta: roundedDelta.toNumber(), // Chênh lệch do làm tròn
      grandTotal: currentTotal.toNumber(), // Tổng cuối cùng
      breakdown: breakdown, // Breakdown tổng hợp
    };
  }
}
