// PricingService - Service tính toán giá vé theo pipeline đầy đủ
// Xử lý: basePrice → surcharges → discounts → tax → rounding

import { Injectable, NotFoundException } from '@nestjs/common';
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
   * Tính giá vé cho 1 ghế
   * @param showId - ID của show (suất chiếu)
   * @param seatId - ID của ghế
   * @param userId - ID của user (để lấy membership tier)
   * @param voucherCode - Mã voucher (optional)
   * @returns Kết quả tính giá với breakdown chi tiết
   */
  async calculatePrice(
    showId: string,
    seatId: string,
    userId: string,
    voucherCode?: string,
  ): Promise<PricingResult> {
    // ========== BƯỚC 1: LẤY DỮ LIỆU CẦN THIẾT ==========

    // 1.1. Lấy show để biết movieId, screenId, screenFormatCode, startTime
    const show = await this.showModel.findById(showId).lean().exec();
    if (!show || !show.isActive) {
      throw new NotFoundException('Show not found or inactive');
    }

    // 1.2. Lấy movie để lấy basePrice
    const movie = await this.movieModel.findById(show.movieId).lean().exec();
    if (!movie) {
      throw new NotFoundException('Movie not found');
    }

    // 1.3. Lấy seat để biết seatTypeCode
    const seat = await this.seatModel.findById(seatId).lean().exec();
    if (!seat || !seat.isActive) {
      throw new NotFoundException('Seat not found or inactive');
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

    // ========== BƯỚC 2: KHỞI TẠO BIẾN TÍNH TOÁN ==========

    // Dùng Decimal.js để tính toán chính xác (tránh lỗi floating point)
    // Ví dụ: 0.1 + 0.2 = 0.30000000000000004 (sai) → dùng Decimal.js sẽ = 0.3 (đúng)
    let currentPrice = new Decimal(movie.basePrice || 0);
    const breakdown: PriceBreakdown[] = [];

    // Thêm breakdown cho basePrice
    breakdown.push({
      type: 'BASE',
      label: 'Giá gốc',
      amount: movie.basePrice || 0,
      meta: { movieId: movie._id.toString(), title: movie.title },
    });

    // ========== BƯỚC 3: PHA 1 - CỘNG SURCHARGES (TĂNG GIÁ) ==========

    // 3.1. Seat Type Surcharge (phụ phí theo loại ghế)
    // TODO: Query từ collection seatTypeSurcharges theo seatTypeCode
    // Tạm thời hardcode: VIP = +20k, standard = 0
    const seatTypeSurcharge = seat.seatTypeCode === 'vip' ? 20000 : 0;
    if (seatTypeSurcharge > 0) {
      currentPrice = currentPrice.plus(seatTypeSurcharge);
      breakdown.push({
        type: 'SURCHARGE',
        label: `Ghế ${seat.seatTypeCode?.toUpperCase() || 'Standard'}`,
        amount: seatTypeSurcharge,
        meta: { seatTypeCode: seat.seatTypeCode },
      });
    }

    // 3.2. Screen Format Surcharge (phụ phí theo định dạng màn hình)
    // TODO: Query từ collection screenSurcharges theo screenFormatCode
    // Tạm thời hardcode: IMAX = +30k, 2D = 0
    const screenFormatSurcharge = show.screenFormatCode === 'IMAX' ? 30000 : 0;
    if (screenFormatSurcharge > 0) {
      currentPrice = currentPrice.plus(screenFormatSurcharge);
      breakdown.push({
        type: 'SURCHARGE',
        label: `Màn hình ${show.screenFormatCode || '2D'}`,
        amount: screenFormatSurcharge,
        meta: { screenFormatCode: show.screenFormatCode },
      });
    }

    // 3.3. Theater Surcharge (phụ phí theo rạp)
    // TODO: Query từ collection theaterSurcharges theo theaterId + screenFormat + dayOfWeek + timeRange
    // Tạm thời hardcode: +10k
    const theaterSurcharge = 10000;
    if (theaterSurcharge > 0) {
      currentPrice = currentPrice.plus(theaterSurcharge);
      breakdown.push({
        type: 'SURCHARGE',
        label: 'Phụ phí rạp',
        amount: theaterSurcharge,
        meta: { theaterId: screen.theaterId?.toString() },
      });
    }

    // 3.4. Time Slot Surcharge (phụ phí theo khung giờ)
    // TODO: Query từ collection timeSlotSurcharges theo dayType (weekend/weekday/holiday) + timeRange
    // Tạm thời: kiểm tra nếu là cuối tuần (Sat/Sun) và giờ 18:00-23:59 → +10k
    const showDate = new Date(show.startTime);
    const dayOfWeek = showDate.getDay(); // 0 = Sunday, 6 = Saturday
    const hour = showDate.getHours();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isEvening = hour >= 18 && hour < 24;
    const timeSlotSurcharge = isWeekend && isEvening ? 10000 : 0;
    if (timeSlotSurcharge > 0) {
      currentPrice = currentPrice.plus(timeSlotSurcharge);
      breakdown.push({
        type: 'SURCHARGE',
        label: 'Cuối tuần tối',
        amount: timeSlotSurcharge,
        meta: { dayType: 'weekend', timeRange: '18:00-23:59' },
      });
    }

    // Lưu subtotal sau Pha 1 (trước khi trừ discount)
    const subtotal = currentPrice.toNumber();

    // ========== BƯỚC 4: PHA 2 - TRỪ DISCOUNTS (GIẢM GIÁ) ==========

    let totalDiscount = new Decimal(0);

    // 4.1. Membership Discount (giảm giá theo hạng thành viên)
    // TODO: Query từ collection membershipTiers theo membershipTier
    // Tạm thời hardcode: diamond = 15%, max 50k
    if (membershipTier === 'diamond') {
      const membershipDiscountPercent = 15; // 15%
      const membershipDiscountAmount = currentPrice
        .times(membershipDiscountPercent)
        .dividedBy(100);
      const membershipDiscountMax = 50000; // Max discount cap
      const membershipDiscount = Decimal.min(
        membershipDiscountAmount,
        membershipDiscountMax,
      );
      if (membershipDiscount.gt(0)) {
        currentPrice = currentPrice.minus(membershipDiscount);
        totalDiscount = totalDiscount.plus(membershipDiscount);
        breakdown.push({
          type: 'DISCOUNT',
          label: `Thành viên ${membershipTier.toUpperCase()} -${membershipDiscountPercent}%`,
          amount: -membershipDiscount.toNumber(), // Âm vì là giảm giá
          meta: { tier: membershipTier, percent: membershipDiscountPercent },
        });
      }
    }

    // 4.2. Promotion (Auto-apply) (khuyến mãi tự động áp dụng)
    // TODO: Query từ collection promotionsV2 theo điều kiện (days, screenFormat, seatType, timeRange, autoApply = true)
    // Tạm thời: nếu là cuối tuần → WEEKEND15: -15%, max 20k
    if (isWeekend) {
      const promoPercent = 15;
      const promoDiscountAmount = currentPrice
        .times(promoPercent)
        .dividedBy(100);
      const promoDiscountMax = 20000;
      const promoDiscount = Decimal.min(promoDiscountAmount, promoDiscountMax);
      if (promoDiscount.gt(0)) {
        currentPrice = currentPrice.minus(promoDiscount);
        totalDiscount = totalDiscount.plus(promoDiscount);
        breakdown.push({
          type: 'DISCOUNT',
          label: 'Khuyến mãi WEEKEND15',
          amount: -promoDiscount.toNumber(),
          meta: { code: 'WEEKEND15', percent: promoPercent },
        });
      }
    }

    // 4.3. Voucher (nếu có) (mã giảm giá do user nhập)
    // TODO: Query từ collection vouchers theo voucherCode, kiểm tra expiresAt, perUserLimit, globalLimit
    // Tạm thời: nếu có voucherCode = "MOVIE5K" → -5k
    if (voucherCode === 'MOVIE5K') {
      const voucherDiscount = 5000;
      currentPrice = currentPrice.minus(voucherDiscount);
      totalDiscount = totalDiscount.plus(voucherDiscount);
      breakdown.push({
        type: 'DISCOUNT',
        label: 'Voucher MOVIE5K',
        amount: -voucherDiscount,
        meta: { code: voucherCode },
      });
    }

    // ========== BƯỚC 5: PHA 3 - CỘNG TAX (THUẾ) ==========

    // 5.1. Tax (VAT) (thuế VAT)
    // TODO: Query từ collection taxRules: VAT 8% (applyAfterDiscounts = true)
    // Tạm thời hardcode: VAT 8%
    const taxRate = 8; // 8%
    const taxAmount = currentPrice.times(taxRate).dividedBy(100);
    currentPrice = currentPrice.plus(taxAmount);
    breakdown.push({
      type: 'TAX',
      label: 'VAT 8%',
      amount: taxAmount.toNumber(),
      meta: { ratePct: taxRate },
    });

    // ========== BƯỚC 6: PHA 4 - ROUNDING (LÀM TRÒN) ==========

    // 6.1. Rounding (làm tròn)
    // TODO: Query từ collection roundingRules: mode = "nearest", step = 1000
    // Tạm thời: làm tròn đến 1000 gần nhất
    const roundingStep = 1000;
    const roundedPrice = currentPrice
      .dividedBy(roundingStep)
      .round()
      .times(roundingStep);
    const roundedDelta = roundedPrice.minus(currentPrice);
    currentPrice = roundedPrice;
    if (roundedDelta.abs().gt(0)) {
      breakdown.push({
        type: 'ROUNDING',
        label: 'Làm tròn',
        amount: roundedDelta.toNumber(),
        meta: { mode: 'nearest', step: roundingStep },
      });
    }

    // ========== BƯỚC 7: TRẢ VỀ KẾT QUẢ ==========

    return {
      basePrice: movie.basePrice || 0,
      subtotal: subtotal, // Tổng sau surcharges (Pha 1)
      totalDiscount: totalDiscount.toNumber(), // Tổng discount (Pha 2)
      totalTax: taxAmount.toNumber(), // Tổng thuế (Pha 3)
      roundedDelta: roundedDelta.toNumber(), // Chênh lệch do làm tròn (Pha 4)
      grandTotal: currentPrice.toNumber(), // Tổng cuối cùng
      breakdown: breakdown, // Chi tiết từng bước
    };
  }
}
