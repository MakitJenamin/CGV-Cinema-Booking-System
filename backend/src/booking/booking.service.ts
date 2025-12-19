// BookingService xử lý logic đặt vé, giữ ghế, thanh toán

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Redis from 'ioredis'; // Import Redis client type từ ioredis
import {
  ReservedTicket,
  ReservedTicketDocument,
} from './schemas/reserved-ticket.schema';
import { Show, ShowDocument } from './schemas/show.schema';
import { PayReservationDto } from './dto/pay-reservation.dto';
import { SelectSeatDto } from './dto/select-seat.dto';
import { CancelSelectingDto } from './dto/cancel-selecting.dto';
import { PayNowSeatsDto, PaymentMethod } from './dto/pay-now-seats.dto';
import { ReserveSeatsDto } from './dto/reserve-seats.dto';
import { CalculatePriceBreakdownDto } from './dto/calculate-price-breakdown.dto';
import { ExtendLockDto } from './dto/extend-lock.dto';
import { Seat, SeatDocument } from './schemas/seat.schema';
import { Movie, MovieDocument } from './schemas/movie.schema';
import { Screen, ScreenDocument } from './schemas/screen.schema';
import { Ticket, TicketDocument } from './schemas/ticket.schema';
import { Payment, PaymentDocument } from './schemas/payment.schema';
import { PriceQuote, PriceQuoteDocument } from './schemas/price-quote.schema';
import {
  PricingAudit,
  PricingAuditDocument,
} from './schemas/pricing-audit.schema';
import { REDIS_CLIENT } from './providers/redis.provider'; // Token để inject Redis client
import { SeatSelectionGateway } from './gateways/seat-selection.gateway'; // Socket.IO gateway
import { PricingService } from './pricing.service'; // Service tính toán giá
import { PaymentGatewayService } from './payment-gateway.service'; // Service mô phỏng cổng thanh toán online

@Injectable()
export class BookingService {
  constructor(
    // Inject MongoDB models (dùng @InjectModel decorator)
    @InjectModel(ReservedTicket.name)
    private reservedTicketModel: Model<ReservedTicketDocument>,
    @InjectModel(Show.name) private showModel: Model<ShowDocument>,
    @InjectModel(Seat.name) private seatModel: Model<SeatDocument>,
    @InjectModel(Movie.name) private movieModel: Model<MovieDocument>,
    @InjectModel(Screen.name) private screenModel: Model<ScreenDocument>,
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>, // Model cho vé đã bán
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>, // Model cho giao dịch thanh toán
    @InjectModel(PriceQuote.name)
    private priceQuoteModel: Model<PriceQuoteDocument>, // Model cho báo giá tạm thời
    @InjectModel(PricingAudit.name)
    private pricingAuditModel: Model<PricingAuditDocument>, // Model cho audit log tính giá
    // Inject Redis client (dùng @Inject với token REDIS_CLIENT)
    @Inject(REDIS_CLIENT)
    private redisClient: Redis,
    // Inject Socket.IO gateway để emit events
    private seatSelectionGateway: SeatSelectionGateway,
    // Inject PricingService để tính giá
    private pricingService: PricingService,
    // Inject PaymentGatewayService để gọi cổng thanh toán (QR / Credit Card)
    private paymentGatewayService: PaymentGatewayService,
  ) {}

  /**
   * Thanh toán reservedTicket tại quầy (staff xử lý)
   * Xử lý mảng seats trong reservedTicket: tạo payment và tickets cho tất cả ghế
   * @param payReservationDto - Mã đặt chỗ và phương thức thanh toán
   * @returns Thông tin thanh toán thành công (ticketIds, paymentId)
   */
  async payReservation(payReservationDto: PayReservationDto): Promise<{
    message: string;
    ticketIds: string[];
    paymentId: string;
    seatCount: number;
  }> {
    // 1. Tìm reservedTicket theo reservationCode
    const reservedTicket = await this.reservedTicketModel
      .findOne({
        reservationCode: payReservationDto.reservationCode,
        status: 'reserved',
      })
      .populate('showId')
      .exec();

    if (!reservedTicket) {
      throw new NotFoundException('Reservation not found or already processed');
    }

    // 2. Kiểm tra còn trong thời gian cho phép (chưa quá 30 phút trước show)
    if (new Date() >= reservedTicket.reservedUntil) {
      // Tự động hủy nếu quá hạn
      reservedTicket.status = 'expired';
      await reservedTicket.save();

      // Cập nhật seatStates về available cho tất cả ghế trong mảng seats
      const show = await this.showModel.findById(reservedTicket.showId).exec();
      if (show && reservedTicket.seats && reservedTicket.seats.length > 0) {
        for (const seat of reservedTicket.seats) {
          const seatKey = `${seat.seatRow}-${seat.seatNumber}`;
          show.seatStates.set(seatKey, {
            status: 'available',
            ticketId: null,
            reservedTicketId: null,
            updatedAt: new Date(),
          });
        }
        await show.save();
      }

      throw new BadRequestException(
        'Reservation has expired. Seats are now available.',
      );
    }

    // 3. Validate mảng seats có dữ liệu không
    if (!reservedTicket.seats || reservedTicket.seats.length === 0) {
      throw new BadRequestException('Reservation has no seats');
    }

    // 4. Lấy show để tính giá
    const show = await this.showModel.findById(reservedTicket.showId).exec();
    if (!show || !show.isActive) {
      throw new NotFoundException('Show not found or inactive');
    }

    // 5. Tính giá cho tất cả ghế (dùng PricingService)
    const seatIds = reservedTicket.seats.map((s) => s.seatId.toString());
    const pricingResult = await this.pricingService.calculatePrice(
      reservedTicket.showId.toString(),
      seatIds, // Mảng seatIds
      reservedTicket.userId.toString(),
      undefined, // Không có voucher khi thanh toán tại quầy
    );

    // 6. Tạo Payment record (1 payment cho tất cả ghế)
    const payment = new this.paymentModel({
      userId: reservedTicket.userId,
      promoCode: undefined, // Không có voucher khi thanh toán tại quầy
      amount: pricingResult.grandTotal,
      currency: 'VND',
      provider: this.mapPaymentMethodToProvider(
        payReservationDto.paymentMethod,
      ),
      paymentMethod: payReservationDto.paymentMethod,
      status: 'success',
      transactionId: this.generateTransactionId(),
      paidAt: new Date(),
      discountBreakdown: pricingResult.breakdown
        .filter((item) => item.type === 'DISCOUNT')
        .map((item) => ({
          type: item.meta?.tier
            ? 'MEMBERSHIP'
            : item.meta?.code
              ? 'VOUCHER'
              : 'PROMO',
          tier: item.meta?.tier,
          code: item.meta?.code,
          amount: Math.abs(item.amount),
        })),
      fees: [],
      tax: {
        name: 'VAT 8%',
        amount: pricingResult.totalTax,
      },
      roundedDelta: pricingResult.roundedDelta,
    });
    await payment.save();

    // 7. Tạo Ticket records (1 ticket cho mỗi ghế trong mảng seats)
    const ticketIds: string[] = [];
    for (const seat of reservedTicket.seats) {
      const qrCode = this.generateQRCode();
      const ticket = new this.ticketModel({
        paymentId: payment._id,
        userId: reservedTicket.userId,
        showId: reservedTicket.showId,
        seatId: seat.seatId,
        seatRow: seat.seatRow,
        seatNumber: seat.seatNumber,
        qrCode: qrCode,
        status: 'active',
        checkedInAt: null,
        issuedAt: new Date(),
      });
      await ticket.save();
      ticketIds.push(ticket._id.toString());

      // 7.1. Cập nhật seatStates trong show = "sold"
      const seatKey = `${seat.seatRow}-${seat.seatNumber}`;
      show.seatStates.set(seatKey, {
        status: 'sold',
        ticketId: ticket._id,
        reservedTicketId: null,
        updatedAt: new Date(),
      });

      // 7.2. Emit Socket.IO event "seat:sold"
      this.seatSelectionGateway.emitSeatSold(
        reservedTicket.showId.toString(),
        seatKey,
      );
    }

    // 8. Lưu show sau khi cập nhật tất cả seatStates
    await show.save();

    // 9. Cập nhật reservedTicket status = 'paid'
    reservedTicket.status = 'paid';
    await reservedTicket.save();

    // 10. Trả về kết quả
    return {
      message: `Payment successful for ${ticketIds.length} seat(s)`,
      ticketIds, // Danh sách ticket IDs
      paymentId: payment._id.toString(), // ID của payment
      seatCount: ticketIds.length, // Số lượng ghế đã thanh toán
    };
  }

  /**
   * Tự động hủy các reservedTickets đã quá hạn
   * Hàm này được gọi bởi cron job mỗi phút
   * Xử lý mảng seats trong reservedTicket: cập nhật seatStates về 'available' cho tất cả ghế
   */
  async cancelExpiredReservations(): Promise<number> {
    const now = new Date();

    // Tìm tất cả reservedTickets đã quá hạn nhưng vẫn còn status = 'reserved'
    const expiredReservations = await this.reservedTicketModel
      .find({
        status: 'reserved',
        reservedUntil: { $lt: now },
      })
      .exec();

    let cancelledCount = 0;

    for (const reservation of expiredReservations) {
      // 1. Cập nhật status = 'expired'
      reservation.status = 'expired';
      await reservation.save();

      // 2. Cập nhật seatStates trong show về 'available' cho TẤT CẢ ghế trong mảng seats
      const show = await this.showModel.findById(reservation.showId).exec();

      if (show && reservation.seats && reservation.seats.length > 0) {
        // 2.1. Duyệt qua từng ghế trong mảng seats
        for (const seat of reservation.seats) {
          // Tạo seatKey từ seatRow và seatNumber
          const seatKey = `${seat.seatRow}-${seat.seatNumber}`;
          const currentState = show.seatStates.get(seatKey);

          // 2.2. Chỉ cập nhật nếu ghế vẫn đang ở trạng thái 'held' và reservedTicketId match
          if (
            currentState?.status === 'held' &&
            currentState.reservedTicketId?.toString() ===
              reservation._id.toString()
          ) {
            // 2.3. Xóa seatKey khỏi seatStates map
            show.seatStates.delete(seatKey);

            // 2.4. Emit Socket.IO event "seat:available" để thông báo cho tất cả clients
            this.seatSelectionGateway.emitSeatAvailable(
              reservation.showId.toString(),
              seatKey,
            );
          }
        }

        // 2.5. Lưu show sau khi cập nhật tất cả seatStates
        await show.save();
      }

      cancelledCount++;
    }

    return cancelledCount;
  }

  /**
   * Tạo mã đặt chỗ ngẫu nhiên (VD: RSV-8F3K9Q)
   */
  private generateReservationCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Bỏ I, O, 0, 1 để tránh nhầm lẫn
    const randomPart = Array.from({ length: 6 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length)),
    ).join('');
    return `RSV-${randomPart}`;
  }

  /**
   * Lấy view tổng hợp seats cho một show:
   * - show
   * - movie
   * - screen
   * - seats (đã merge seatStates → status: available/held/sold/blocked)
   */
  async getSeatsView(showId: string) {
    // 1. Lấy show (có seatStates)
    const show = await this.showModel.findById(showId).lean().exec();
    if (!show || !show.isActive) {
      throw new NotFoundException('Show not found or inactive');
    }

    // 2. Lấy movie để hiển thị kèm tên/ảnh
    const movie = await this.movieModel.findById(show.movieId).lean().exec();

    // 3. Lấy screen để hiển thị thông tin phòng
    const screen = await this.screenModel.findById(show.screenId).lean().exec();

    // 4. Lấy tất cả seats của screen (ghế đang active)
    const seats = await this.seatModel
      .find({ screenId: show.screenId, isActive: true })
      .lean()
      .exec();

    // 5. Merge seatStates vào seats: mỗi ghế có status cuối cùng
    // seatStates có thể là Map (nếu không lean) hoặc object (lean). Viết helper để đọc thống nhất.
    const seatStatesRaw = show.seatStates || {};
    const getSeatState = (key: string) => {
      if (seatStatesRaw instanceof Map) {
        return seatStatesRaw.get(key);
      }
      return (seatStatesRaw as Record<string, any>)[key];
    };

    const mergedSeats = seats.map((seat) => {
      const key = `${seat.row}-${seat.number}`;
      const state = getSeatState(key);

      return {
        _id: seat._id,
        row: seat.row,
        number: seat.number,
        seatTypeCode: seat.seatTypeCode,
        seatTypeId: seat.seatTypeId,
        status: state?.status ?? 'available',
      };
    });

    // 6. Trả về payload đã gộp, frontend chỉ render
    return {
      show,
      movie,
      screen,
      seats: mergedSeats,
    };
  }

  /**
   * Chọn ghế (selecting) - Set Redis lock khi user click ghế
   * Flow: User click ghế → Set Redis lock (TTL 1 phút) → Emit Socket.IO event → Tính giá cho tất cả ghế đang chọn
   * @param userId - ID của user đang chọn ghế
   * @param newSeat - Thông tin ghế vừa chọn (cần set lock)
   * @param selectedSeats - Danh sách TẤT CẢ ghế đang chọn (bao gồm ghế vừa chọn) - để tính giá tổng
   * @returns Thông báo thành công, seatId, và pricing data (calculatePrice + breakdown)
   */
  async selectSeat(
    userId: string,
    newSeat: SelectSeatDto, // Ghế vừa chọn (cần set lock)
    selectedSeats: SelectSeatDto[], // Tất cả ghế đang chọn (để tính giá)
  ): Promise<{
    message: string;
    seatId: string;
    // Pricing data để FE hiển thị ngay (Phase 1) và tận dụng cho Phase 2
    pricing: {
      // Giá tổng (chưa có voucher, chưa có tax) - hiển thị ở Phase 1
      totalPrice: number;
      seatCount: number;
      breakdown: Array<{
        type: string;
        label: string;
        amount: number;
      }>;
      // Breakdown đầy đủ (có voucher, tax, rounding) - tận dụng cho Phase 2
      fullBreakdown: {
        basePrice: number;
        subtotal: number;
        totalDiscount: number;
        totalTax: number;
        roundedDelta: number;
        grandTotal: number;
        breakdown: Array<{
          type: string;
          label: string;
          amount: number;
          meta?: Record<string, any>;
        }>;
      };
    };
  }> {
    // 1. Validate: tất cả ghế phải cùng 1 show
    const showId = newSeat.showId;
    for (const seat of selectedSeats) {
      if (seat.showId !== showId) {
        throw new BadRequestException('All seats must belong to the same show');
      }
    }

    // 2. Tạo Redis key theo format: seat:selecting:{showId}:{seatRow}-{seatNumber}
    // Ví dụ: seat:selecting:show123:A-1
    const seatKey = `${newSeat.seatRow}-${newSeat.seatNumber}`;
    const redisKey = `seat:selecting:${showId}:${seatKey}`;

    // 3. Kiểm tra show có tồn tại không
    const show = await this.showModel.findById(showId).exec();
    if (!show || !show.isActive) {
      throw new NotFoundException('Show not found or inactive');
    }

    // 4. Kiểm tra ghế có tồn tại không
    const seat = await this.seatModel.findById(newSeat.seatId).exec();
    if (!seat || !seat.isActive) {
      throw new NotFoundException('Seat not found or inactive');
    }

    // 5. Kiểm tra ghế có đang available không (từ seatStates trong show)
    const currentSeatState = show.seatStates.get(seatKey);
    if (currentSeatState) {
      // Nếu ghế đã sold → không thể chọn
      if (currentSeatState.status === 'sold') {
        throw new ConflictException('Seat is already sold');
      }
      // Nếu ghế đã held → không thể chọn (đã có người đặt trước)
      if (currentSeatState.status === 'held') {
        throw new ConflictException('Seat is already reserved');
      }
      // Nếu ghế bị blocked → không thể chọn
      if (currentSeatState.status === 'blocked') {
        throw new BadRequestException('Seat is blocked');
      }
    }

    // 6. Thực hiện Redis SET với NX (chỉ set nếu key chưa tồn tại) và EX (TTL = 60 giây)
    // SET NX EX là atomic operation → đảm bảo chỉ 1 user có thể set lock tại 1 thời điểm
    const lockResult = await this.redisClient.set(
      redisKey, // Key
      userId, // Value = userId để biết ai đang giữ lock
      'EX', // Set TTL (expiry time)
      60, // TTL = 60 giây (1 phút)
      'NX', // Chỉ set nếu key chưa tồn tại (Not eXists)
    );

    // 7. Kiểm tra kết quả SET
    // Nếu lockResult === 'OK' → thành công, user này giữ lock
    // Nếu lockResult === null → thất bại, ghế đang được chọn bởi user khác
    if (lockResult !== 'OK') {
      throw new ConflictException('Seat is being selected by another user');
    }

    // 8. Emit Socket.IO event "seat:selecting" tới TẤT CẢ clients
    // Tất cả clients (kể cả user hiện tại) sẽ cập nhật UI: ghế chuyển sang màu "selecting"
    this.seatSelectionGateway.emitSeatSelecting(showId, seatKey, userId);

    // 9. Tính giá cho TẤT CẢ ghế đang chọn (từ mảng selectedSeats)
    // Lấy danh sách seatIds từ mảng selectedSeats
    const seatIds = selectedSeats.map((s) => s.seatId);

    // 9.1. Tính giá (chưa có voucher) - dùng cho Phase 1
    const pricingResult = await this.pricingService.calculatePrice(
      showId,
      seatIds,
      userId,
      undefined, // Không có voucher ở Phase 1
    );

    // 9.2. Tính breakdown đầy đủ (có voucher = undefined, nhưng vẫn tính tax/rounding) - dùng cho Phase 2
    // Breakdown này sẽ được tận dụng, chỉ cần update lại khi user nhập voucher
    const fullBreakdown = {
      basePrice: pricingResult.basePrice,
      subtotal: pricingResult.subtotal,
      totalDiscount: pricingResult.totalDiscount, // = 0 vì chưa có voucher
      totalTax: pricingResult.totalTax,
      roundedDelta: pricingResult.roundedDelta,
      grandTotal: pricingResult.grandTotal,
      breakdown: pricingResult.breakdown,
    };

    // 10. Trả về thông báo thành công kèm pricing data
    return {
      message: 'Seat selected successfully',
      seatId: seatKey,
      pricing: {
        // Giá tổng (chưa có voucher, chưa có tax) - hiển thị ở Phase 1
        totalPrice: pricingResult.subtotal,
        seatCount: selectedSeats.length,
        breakdown: pricingResult.breakdown.filter(
          (item) => item.type !== 'DISCOUNT' && item.type !== 'TAX',
        ), // Chỉ lấy BASE và SURCHARGE
        // Breakdown đầy đủ - tận dụng cho Phase 2 (chỉ cần update khi có voucher)
        fullBreakdown,
      },
    };
  }

  /**
   * Gia hạn Redis lock thêm 5 phút khi user vào Phase 2 (chọn voucher và thanh toán)
   * Flow: User ấn "Next" → Gia hạn lock cho TẤT CẢ ghế đang chọn từ 1 phút lên 6 phút (1 phút còn lại + 5 phút mới)
   * @param userId - ID của user đang giữ lock
   * @param extendLockDto - Thông tin show và mảng các ghế cần gia hạn lock
   * @returns Thông báo thành công và số lượng ghế đã gia hạn
   */
  async extendLock(
    userId: string,
    extendLockDto: ExtendLockDto,
  ): Promise<{ message: string; extendedCount: number }> {
    // 1. Validate: mảng seats không được rỗng
    if (!extendLockDto.seats || extendLockDto.seats.length === 0) {
      throw new BadRequestException('At least one seat must be provided');
    }

    let extendedCount = 0;
    const errors: string[] = [];

    // 2. Loop qua tất cả ghế trong mảng và gia hạn lock cho từng ghế
    for (const seat of extendLockDto.seats) {
      // 2.1. Tạo Redis key giống như khi select
      const seatKey = `${seat.seatRow}-${seat.seatNumber}`;
      const redisKey = `seat:selecting:${extendLockDto.showId}:${seatKey}`;

      // 2.2. Kiểm tra Redis lock có tồn tại không và phải là của user này
      const lockOwner = await this.redisClient.get(redisKey);

      // 2.3. Nếu không có lock hoặc lock không phải của user này → bỏ qua ghế này
      if (!lockOwner || lockOwner !== userId) {
        errors.push(
          `Seat ${seatKey}: Lock not found or you do not own this lock`,
        );
        continue; // Bỏ qua ghế này, tiếp tục với ghế tiếp theo
      }

      // 2.4. Gia hạn lock thêm 5 phút (300 giây)
      // EXPIRE sẽ set TTL mới cho key (không phụ thuộc vào TTL cũ)
      await this.redisClient.expire(redisKey, 300); // 5 phút = 300 giây
      extendedCount++;
    }

    // 3. Nếu không có ghế nào được gia hạn → báo lỗi
    if (extendedCount === 0) {
      throw new BadRequestException(
        `Failed to extend locks. ${errors.join('; ')}`,
      );
    }

    // 4. Trả về thông báo thành công và số lượng ghế đã gia hạn
    return {
      message: `Lock extended successfully for ${extendedCount} seat(s)`,
      extendedCount,
    };
  }

  /**
   * Tính breakdown giá chi tiết cho các ghế đang chọn (Phase 2 - có voucher)
   * Flow: User chọn voucher → Hiển thị breakdown chi tiết (có voucher, tax, rounding)
   * @param userId - ID của user
   * @param calculatePriceBreakdownDto - Thông tin show, ghế và voucher
   * @returns Breakdown giá chi tiết đầy đủ (có voucher, tax, rounding)
   */
  async calculatePriceBreakdown(
    userId: string,
    calculatePriceBreakdownDto: CalculatePriceBreakdownDto,
  ): Promise<{
    basePrice: number;
    subtotal: number;
    totalDiscount: number;
    totalTax: number;
    roundedDelta: number;
    grandTotal: number;
    breakdown: Array<{
      type: string;
      label: string;
      amount: number;
      meta?: Record<string, any>;
    }>;
  }> {
    // 1. Lấy danh sách seatIds
    const seatIds = calculatePriceBreakdownDto.seats.map((s) => s.seatId);

    // 2. Gọi PricingService để tính giá đầy đủ (có voucher nếu có)
    const pricingResult = await this.pricingService.calculatePrice(
      calculatePriceBreakdownDto.showId,
      seatIds,
      userId,
      calculatePriceBreakdownDto.voucherCode, // Có voucher ở Phase 2
    );

    // 3. Trả về breakdown đầy đủ
    return {
      basePrice: pricingResult.basePrice,
      subtotal: pricingResult.subtotal,
      totalDiscount: pricingResult.totalDiscount,
      totalTax: pricingResult.totalTax,
      roundedDelta: pricingResult.roundedDelta,
      grandTotal: pricingResult.grandTotal,
      breakdown: pricingResult.breakdown,
    };
  }

  /**
   * Bỏ chọn ghế (cancel selecting) - Xóa Redis lock khi user bỏ chọn
   * Flow: User bỏ chọn → Xóa Redis lock → Emit Socket.IO event "seat:available"
   * @param userId - ID của user đang bỏ chọn
   * @param cancelSelectingDto - Thông tin ghế muốn bỏ chọn
   * @returns Thông báo thành công
   */
  async cancelSelecting(
    userId: string,
    cancelSelectingDto: CancelSelectingDto,
  ): Promise<{ message: string }> {
    // 1. Tạo Redis key giống như khi select
    const seatKey = `${cancelSelectingDto.seatRow}-${cancelSelectingDto.seatNumber}`;
    const redisKey = `seat:selecting:${cancelSelectingDto.showId}:${seatKey}`;

    // 2. Kiểm tra Redis lock có tồn tại không và phải là của user này
    // GET để lấy value (userId) của key
    const lockOwner = await this.redisClient.get(redisKey);

    // 3. Nếu không có lock hoặc lock không phải của user này → báo lỗi
    if (!lockOwner || lockOwner !== userId) {
      throw new BadRequestException(
        'You are not the owner of this seat selection or the seat is not selected',
      );
    }

    // 4. Xóa Redis lock (DEL key)
    await this.redisClient.del(redisKey);

    // 5. Emit Socket.IO event "seat:available" tới TẤT CẢ clients
    // Tất cả clients sẽ cập nhật UI: ghế quay về màu "available"
    this.seatSelectionGateway.emitSeatAvailable(
      cancelSelectingDto.showId,
      seatKey,
    );

    // 6. Trả về thông báo thành công
    return {
      message: 'Seat selection cancelled successfully',
    };
  }

  /**
   * Map paymentMethod sang provider (nhà cung cấp thanh toán)
   * @param paymentMethod - Phương thức thanh toán (credit_card, debit_card, cash, e_wallet)
   * @returns Provider name (vnpay, momo, zalopay, credit_card)
   */
  private mapPaymentMethodToProvider(paymentMethod: string): string {
    // Map paymentMethod sang provider tương ứng
    const mapping: Record<string, string> = {
      credit_card: 'credit_card', // Thẻ tín dụng → credit_card provider
      debit_card: 'credit_card', // Thẻ ghi nợ → credit_card provider
      e_wallet: 'momo', // Ví điện tử → momo provider (tạm thời, sau sẽ mở rộng)
      cash: 'cash', // Tiền mặt → cash (thanh toán tại quầy)
    };
    return mapping[paymentMethod] || 'vnpay'; // Mặc định là vnpay
  }

  /**
   * Generate Transaction ID (tạm thời, sau sẽ lấy từ payment gateway)
   * @returns Transaction ID (format: VNP + timestamp + random)
   */
  private generateTransactionId(): string {
    // Tạm thời generate transaction ID
    // Format: VNP + timestamp + random 3 số
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `VNP${timestamp}${random}`;
  }

  /**
   * Generate QR code duy nhất cho vé
   * @returns QR code (format: CGV + timestamp + random)
   */
  private generateQRCode(): string {
    // Generate QR code duy nhất
    // Format: CGV + timestamp + random 6 ký tự
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `CGV${timestamp}${random}`;
  }

  /**
   * Đặt trước nhiều ghế cùng lúc (reserve) - Tạo 1 reservedTicket với mảng seats
   * Flow: User ấn "Đặt trước" → Tạo 1 reservedTicket chứa mảng seats → Cập nhật seatStates = "held" cho tất cả ghế
   * @param userId - ID của user đặt trước
   * @param reserveSeatsDto - Thông tin các ghế muốn đặt trước
   * @returns Thông báo thành công, reservation code và reservedTicketId
   */
  async reserveSeats(
    userId: string,
    reserveSeatsDto: ReserveSeatsDto,
  ): Promise<{
    message: string;
    reservationCode: string;
    reservedTicketId: string;
    seatCount: number;
  }> {
    // 1. Validate số lượng ghế (tối thiểu 1 ghế)
    if (!reserveSeatsDto.seats || reserveSeatsDto.seats.length === 0) {
      throw new BadRequestException('At least one seat is required');
    }

    // 2. Kiểm tra show có tồn tại không và đang active
    const show = await this.showModel.findById(reserveSeatsDto.showId).exec();
    if (!show || !show.isActive) {
      throw new NotFoundException('Show not found or inactive');
    }

    // 3. Tính reservedUntil (30 phút trước khi show bắt đầu)
    const reservedUntil = new Date(show.startTime);
    reservedUntil.setMinutes(reservedUntil.getMinutes() - 30);

    // 4. Validate và thu thập thông tin các ghế hợp lệ
    const validSeats: Array<{
      seatId: Types.ObjectId;
      seatRow: string;
      seatNumber: number;
      seatKey: string;
    }> = []; // Danh sách ghế hợp lệ (có Redis lock và available)

    for (const seatInfo of reserveSeatsDto.seats) {
      // 4.1. Tạo seatKey
      const seatKey = `${seatInfo.seatRow}-${seatInfo.seatNumber}`;
      const redisKey = `seat:selecting:${reserveSeatsDto.showId}:${seatKey}`;

      // 4.2. Kiểm tra Redis lock có tồn tại không và phải là của user này
      const lockOwner = await this.redisClient.get(redisKey);
      if (!lockOwner || lockOwner !== userId) {
        // Nếu không có lock hoặc không phải của user này → bỏ qua ghế này
        continue;
      }

      // 4.3. Kiểm tra ghế có tồn tại không và đang active
      const seat = await this.seatModel.findById(seatInfo.seatId).exec();
      if (!seat || !seat.isActive) {
        continue; // Bỏ qua ghế này
      }

      // 4.4. Kiểm tra ghế có đang available/selecting không (không được sold hoặc held)
      const currentSeatState = show.seatStates.get(seatKey);
      if (currentSeatState) {
        if (
          currentSeatState.status === 'sold' ||
          currentSeatState.status === 'held'
        ) {
          continue; // Bỏ qua ghế này
        }
      }

      // 4.5. Thêm vào danh sách ghế hợp lệ
      validSeats.push({
        seatId: new Types.ObjectId(seatInfo.seatId),
        seatRow: seatInfo.seatRow,
        seatNumber: seatInfo.seatNumber,
        seatKey: seatKey,
      });
    }

    // 5. Kiểm tra có ít nhất 1 ghế hợp lệ không
    if (validSeats.length === 0) {
      throw new BadRequestException(
        'No valid seats found. Please ensure all seats are selected and available.',
      );
    }

    // 6. Tạo 1 reservedTicket duy nhất với mảng seats
    const reservationCode = this.generateReservationCode();
    const reservedTicket = new this.reservedTicketModel({
      userId: new Types.ObjectId(userId), // User đặt vé
      showId: new Types.ObjectId(reserveSeatsDto.showId), // Show (suất chiếu)
      seats: validSeats.map((s) => ({
        // Mảng seats chứa tất cả ghế hợp lệ
        seatId: s.seatId,
        seatRow: s.seatRow,
        seatNumber: s.seatNumber,
      })),
      reservationCode: reservationCode, // 1 mã đặt chỗ cho tất cả ghế
      status: 'reserved', // Trạng thái: reserved (đang giữ)
      reservedUntil: reservedUntil, // Thời gian hết hạn (30 phút trước khi show bắt đầu)
      channel: 'online', // Kênh đặt: online (web/app)
    });
    await reservedTicket.save();

    // 7. Cập nhật seatStates trong show = "held" cho tất cả ghế hợp lệ
    for (const validSeat of validSeats) {
      show.seatStates.set(validSeat.seatKey, {
        status: 'held', // Trạng thái: held (đã đặt trước)
        ticketId: null, // Chưa có ticket (chưa thanh toán)
        reservedTicketId: reservedTicket._id, // Link đến reservedTicket (cùng 1 reservedTicket cho tất cả ghế)
        updatedAt: new Date(), // Thời gian cập nhật
      });

      // 7.1. Xóa Redis lock (vì đã tạo reservedTicket, không cần lock nữa)
      const redisKey = `seat:selecting:${reserveSeatsDto.showId}:${validSeat.seatKey}`;
      await this.redisClient.del(redisKey);

      // 7.2. Emit Socket.IO event "seat:held" cho từng ghế
      this.seatSelectionGateway.emitSeatHeld(
        reserveSeatsDto.showId,
        validSeat.seatKey,
      );
    }

    // 8. Lưu show (sau khi cập nhật tất cả seatStates)
    await show.save();

    // 9. Trả về kết quả
    return {
      message: `Successfully reserved ${validSeats.length} seat(s)`,
      reservationCode: reservationCode, // 1 mã đặt chỗ cho tất cả ghế
      reservedTicketId: reservedTicket._id.toString(), // ID của reservedTicket (1 document duy nhất)
      seatCount: validSeats.length, // Số lượng ghế đã đặt trước
    };
  }

  /**
   * Thanh toán ngay cho nhiều ghế cùng lúc (pay-now) - Thanh toán không qua reservedTicket
   * Flow đầy đủ:
   * 1. Kiểm tra Redis lock cho tất cả ghế
   * 2. Validate show, seats, seatStates
   * 3. Tính giá cho tất cả ghế (dùng PricingService)
   * 4. Validate quote (nếu có quoteId)
   * 5. Tạo Payment record (1 payment cho tất cả ghế)
   * 6. Tạo Ticket records (1 ticket cho mỗi ghế)
   * 7. Cập nhật show.seatStates = "sold" cho tất cả ghế
   * 8. Tạo PricingAudit log
   * 9. Xóa Redis lock cho tất cả ghế
   * 10. Emit Socket.IO events "seat:sold" cho tất cả ghế
   * @param userId - ID của user thanh toán
   * @param payNowSeatsDto - Thông tin các ghế, phương thức thanh toán, voucherCode (optional), quoteId (optional)
   * @returns Thông tin tickets, payment đã tạo
   */
  async payNowSeats(
    userId: string,
    payNowSeatsDto: PayNowSeatsDto,
    ipAddr: string, // IP của user (lấy từ request) - cần cho VNPay
    returnUrl: string, // URL FE nhận kết quả sau khi thanh toán - cần cho VNPay
  ): Promise<{
    message: string;
    paymentId: string;
    amount: number;
    breakdown: any[];
    // Thông tin thêm để frontend có thể hiển thị / redirect tới cổng thanh toán
    paymentProvider?: string; // Tên cổng thanh toán thực tế (vnpaySandbox / stripeSandbox / ...)
    paymentQrUrl?: string; // URL ảnh QR nếu thanh toán QR
    paymentCheckoutUrl?: string; // URL trang checkout nếu thanh toán Credit Card
    orderCode?: string; // Mã đơn hàng để trace giao dịch
  }> {
    // ========== BƯỚC 1: VALIDATE ĐẦU VÀO ==========

    // 1.1. Validate số lượng ghế (tối thiểu 1 ghế)
    if (!payNowSeatsDto.seats || payNowSeatsDto.seats.length === 0) {
      throw new BadRequestException('At least one seat is required');
    }

    // ========== BƯỚC 2: KIỂM TRA REDIS LOCK CHO TẤT CẢ GHẾ ==========

    // 2.1. Kiểm tra Redis lock cho từng ghế
    const seatKeys: string[] = []; // Danh sách seatKey
    const redisKeys: string[] = []; // Danh sách redisKey tương ứng

    for (const seatInfo of payNowSeatsDto.seats) {
      const seatKey = `${seatInfo.seatRow}-${seatInfo.seatNumber}`;
      const redisKey = `seat:selecting:${payNowSeatsDto.showId}:${seatKey}`;
      seatKeys.push(seatKey);
      redisKeys.push(redisKey);

      // 2.2. Kiểm tra Redis lock có tồn tại không và phải là của user này
      const lockOwner = await this.redisClient.get(redisKey);
      if (!lockOwner || lockOwner !== userId) {
        throw new BadRequestException(
          `You must select seat ${seatKey} first before paying`,
        );
      }
    }

    // ========== BƯỚC 3: VALIDATE SHOW, SEATS, SEATSTATES ==========

    // 3.1. Kiểm tra show có tồn tại không và đang active
    const show = await this.showModel.findById(payNowSeatsDto.showId).exec();
    if (!show || !show.isActive) {
      throw new NotFoundException('Show not found or inactive');
    }

    // 3.2. Kiểm tra tất cả ghế có tồn tại không và đang active
    const seats = await this.seatModel
      .find({
        _id: { $in: payNowSeatsDto.seats.map((s) => s.seatId) },
        isActive: true,
      })
      .exec();

    if (seats.length !== payNowSeatsDto.seats.length) {
      throw new NotFoundException('Some seats not found or inactive');
    }

    // 3.3. Kiểm tra tất cả ghế có đang available/selecting không
    for (let i = 0; i < payNowSeatsDto.seats.length; i++) {
      const seatKey = seatKeys[i];
      const currentSeatState = show.seatStates.get(seatKey);

      if (currentSeatState) {
        if (currentSeatState.status === 'sold') {
          throw new ConflictException(`Seat ${seatKey} is already sold`);
        }
        if (currentSeatState.status === 'held') {
          throw new ConflictException(`Seat ${seatKey} is already reserved`);
        }
      }
    }

    // ========== BƯỚC 4: TÍNH GIÁ CHO TẤT CẢ GHẾ (DÙNG PRICINGSERVICE) ==========

    // 4.1. Lấy danh sách seatIds
    const seatIds = payNowSeatsDto.seats.map((s) => s.seatId);

    // 4.2. Gọi PricingService để tính giá cho tất cả ghế
    const pricingResult = await this.pricingService.calculatePrice(
      payNowSeatsDto.showId, // showId để lấy movie, screen, screenFormat
      seatIds, // Mảng seatIds
      userId, // userId để lấy membership tier
      payNowSeatsDto.voucherCode, // voucherCode (optional) - chỉ áp dụng 1 lần cho toàn bộ đơn hàng
    );

    // 4.3. Validate quote (nếu có quoteId)
    if (payNowSeatsDto.quoteId) {
      const quote = await this.priceQuoteModel
        .findOne({ quoteId: payNowSeatsDto.quoteId })
        .exec();
      if (
        !quote ||
        quote.expiresAt < new Date() ||
        quote.userId.toString() !== userId ||
        quote.showId.toString() !== payNowSeatsDto.showId
      ) {
        throw new BadRequestException('Invalid or expired quote');
      }
      const priceDiff = Math.abs(quote.price - pricingResult.grandTotal);
      if (priceDiff > 1000) {
        throw new BadRequestException(
          'Price has changed. Please refresh and try again.',
        );
      }
    }

    // ========== BƯỚC 4.4: KHỞI TẠO THANH TOÁN VỚI CỔNG THANH TOÁN (QR / CREDIT CARD) ==========

    // Tạo orderCode (mã đơn hàng) để gửi sang cổng thanh toán
    const orderCode = `ORD-${Date.now()}`;

    // Mặc định: dùng provider map theo paymentMethod hiện tại + transactionId generate nội bộ
    // Nếu là CREDIT_CARD / E_WALLET thì sẽ override bằng kết quả từ PaymentGatewayService.
    let provider = this.mapPaymentMethodToProvider(
      payNowSeatsDto.paymentMethod,
    );
    let transactionId = this.generateTransactionId();
    let paymentQrUrl: string | undefined; // Dùng cho flow QR
    let paymentCheckoutUrl: string | undefined; // Dùng cho flow Credit Card

    // Nếu user chọn thanh toán bằng Credit Card → gọi VNPay tạo URL thanh toán
    if (payNowSeatsDto.paymentMethod === PaymentMethod.CREDIT_CARD) {
      const cardResult = await this.paymentGatewayService.initiateCardPayment(
        pricingResult.grandTotal,
        'VND',
        orderCode,
        ipAddr, // IP của user (VNPay yêu cầu)
        returnUrl, // URL FE nhận kết quả (VNPay redirect về đây)
      );
      provider = cardResult.provider;
      transactionId = cardResult.transactionId;
      paymentCheckoutUrl = cardResult.checkoutUrl;
    }

    // Nếu user chọn thanh toán bằng ví điện tử (E_WALLET) → gọi VNPay tạo URL thanh toán QR
    if (payNowSeatsDto.paymentMethod === PaymentMethod.E_WALLET) {
      const qrResult = await this.paymentGatewayService.initiateQrPayment(
        pricingResult.grandTotal,
        'VND',
        orderCode,
        ipAddr, // IP của user (VNPay yêu cầu)
        returnUrl, // URL FE nhận kết quả (VNPay redirect về đây)
      );
      provider = qrResult.provider;
      transactionId = qrResult.transactionId;
      paymentCheckoutUrl = qrResult.checkoutUrl; // VNPay trả về checkoutUrl (user mở URL này để quét QR)
      paymentQrUrl = qrResult.qrUrl; // Nếu VNPay có trả về QR URL riêng
    }

    // ========== BƯỚC 5: TẠO PAYMENT RECORD (1 PAYMENT CHO TẤT CẢ GHẾ) ==========
    // Lưu ý: đặt status = 'pending' vì chưa nhận callback thành công từ cổng thanh toán.
    // Lưu kèm snapshot showId + seats để webhook dùng finalize phát hành vé.
    const payment = new this.paymentModel({
      userId: new Types.ObjectId(userId),
      promoCode: payNowSeatsDto.voucherCode,
      amount: pricingResult.grandTotal, // Tổng số tiền thanh toán cho tất cả ghế
      currency: 'VND',
      provider, // Tên provider thực tế (vnpaySandbox / stripeSandbox / ...)
      paymentMethod: payNowSeatsDto.paymentMethod,
      status: 'pending', // Chờ cổng thanh toán xác nhận
      transactionId, // Mã giao dịch từ PaymentGatewayService (hoặc generate nội bộ)
      paidAt: undefined, // Sẽ set khi cổng thanh toán trả về thành công
      // Lưu thêm metadata phục vụ redirect/hiển thị QR
      orderCode,
      qrUrl: paymentQrUrl,
      checkoutUrl: paymentCheckoutUrl,
      showId: new Types.ObjectId(payNowSeatsDto.showId),
      seats: payNowSeatsDto.seats.map((s) => ({
        seatId: new Types.ObjectId(s.seatId),
        seatRow: s.seatRow,
        seatNumber: s.seatNumber,
      })),
      discountBreakdown: pricingResult.breakdown
        .filter((item) => item.type === 'DISCOUNT')
        .map((item) => ({
          type: item.meta?.tier
            ? 'MEMBERSHIP'
            : item.meta?.code
              ? 'VOUCHER'
              : 'PROMO',
          tier: item.meta?.tier,
          code: item.meta?.code,
          amount: Math.abs(item.amount),
        })),
      tax: {
        name: 'VAT 8%',
        amount: pricingResult.totalTax,
      },
      roundedDelta: pricingResult.roundedDelta,
    });
    await payment.save();

    // ========== BƯỚC 6: TẠO PRICING AUDIT LOG ==========
    const audit = new this.pricingAuditModel({
      quoteId: payNowSeatsDto.quoteId,
      userId: new Types.ObjectId(userId),
      showId: new Types.ObjectId(payNowSeatsDto.showId),
      seats: payNowSeatsDto.seats.map((seatInfo, index) => ({
        seatId: new Types.ObjectId(seatInfo.seatId),
        type: seats[index]?.seatTypeCode,
      })),
      pipeline: pricingResult.breakdown.map((item) => ({
        step: item.type.toLowerCase(),
        amount: item.amount,
        meta: item.meta,
      })),
      priceBefore: pricingResult.basePrice,
      priceAfter: pricingResult.grandTotal,
    });
    await audit.save();

    // ========== BƯỚC 7: TRẢ VỀ KẾT QUẢ ==========
    // Không tạo ticket, không cập nhật seatStates = 'sold' ở bước này.
    // FE cần redirect/hiển thị QR và chờ cổng thanh toán confirm (webhook/confirm API) rồi mới phát hành vé.

    return {
      message: 'Payment initiated. Complete the payment to issue tickets.',
      paymentId: payment._id.toString(), // ID của payment (status = pending)
      amount: pricingResult.grandTotal, // Tổng số tiền thanh toán
      breakdown: pricingResult.breakdown, // Chi tiết từng bước tính giá
      paymentProvider: provider, // Provider thực tế (vnpaySandbox / stripeSandbox / ...)
      paymentQrUrl, // URL QR nếu user dùng E_WALLET
      paymentCheckoutUrl, // URL checkout nếu user dùng CREDIT_CARD
      orderCode, // Mã đơn hàng để trace giao dịch
    };
  }

  /**
   * Hàm dùng nội bộ để finalize 1 payment pending:
   * - Đổi status → success + set paidAt
   * - Tạo tickets cho tất cả ghế snapshot trong payment.seats
   * - Cập nhật show.seatStates = 'sold'
   * - Xóa Redis lock
   * - Emit Socket.IO "seat:sold"
   * Hàm này được gọi từ webhook hoặc từ 1 endpoint confirm thủ công.
   */
  async finalizePayment(payment: PaymentDocument): Promise<{
    ticketIds: string[];
  }> {
    // Nếu payment không còn pending thì bỏ qua (idempotent)
    if (payment.status !== 'pending') {
      return { ticketIds: [] };
    }

    if (!payment.showId || !payment.seats || payment.seats.length === 0) {
      throw new BadRequestException(
        'Payment missing showId or seats snapshot for finalization',
      );
    }

    // 1. Đổi trạng thái payment → success + set paidAt
    payment.status = 'success';
    payment.paidAt = new Date();
    await payment.save();

    // 2. Lấy show để cập nhật seatStates
    const show = await this.showModel.findById(payment.showId).exec();
    if (!show || !show.isActive) {
      throw new NotFoundException('Show not found or inactive when finalize');
    }

    // 3. Tạo tickets cho từng ghế snapshot trong payment.seats
    const ticketIds: string[] = [];
    for (const seatSnap of payment.seats) {
      const qrCode = this.generateQRCode();
      const ticket = new this.ticketModel({
        paymentId: payment._id,
        userId: payment.userId,
        showId: payment.showId,
        seatId: seatSnap.seatId,
        seatRow: seatSnap.seatRow,
        seatNumber: seatSnap.seatNumber,
        qrCode,
        status: 'active',
        checkedInAt: null,
        issuedAt: new Date(),
      });
      await ticket.save();
      ticketIds.push(ticket._id.toString());

      // Cập nhật seatStates = 'sold'
      const seatKey = `${seatSnap.seatRow}-${seatSnap.seatNumber}`;
      show.seatStates.set(seatKey, {
        status: 'sold',
        ticketId: ticket._id,
        reservedTicketId: null,
        updatedAt: new Date(),
      });

      // Xóa Redis lock (nếu còn)
      const redisKey = `seat:selecting:${payment.showId.toString()}:${seatKey}`;
      await this.redisClient.del(redisKey);

      // Emit Socket.IO
      this.seatSelectionGateway.emitSeatSold(
        payment.showId.toString(),
        seatKey,
      );
    }

    await show.save();

    return { ticketIds };
  }

  /**
   * Xử lý IPN (Instant Payment Notification) từ VNPay
   * VNPay gọi endpoint này (GET /booking/payments/vnpay-ipn) sau khi user thanh toán xong.
   * Đây là nơi xử lý business logic (tạo ticket, update seatStates, ...)
   * @param queryParams - Query params từ VNPay IPN request (chứa vnp_TxnRef, vnp_ResponseCode, vnp_Amount, vnp_SecureHash, ...)
   * @returns Response cho VNPay (theo format VNPay yêu cầu)
   */
  async handleVnpayIpn(queryParams: Record<string, string>): Promise<{
    RspCode: string; // Mã phản hồi cho VNPay ('00' = thành công, khác = lỗi)
    Message: string; // Thông báo cho VNPay
  }> {
    try {
      // 1. Verify chữ ký từ VNPay (đảm bảo dữ liệu không bị giả mạo)
      const verify = this.paymentGatewayService.verifyIpnCall(queryParams);

      // Nếu chữ ký không hợp lệ → reject
      if (!verify.isVerified) {
        return {
          RspCode: '97', // Mã lỗi VNPay: chữ ký không hợp lệ
          Message: 'Invalid signature',
        };
      }

      // 2. Lấy thông tin từ query params
      const orderCode = queryParams['vnp_TxnRef']; // Mã đơn hàng (orderCode)
      const responseCode = queryParams['vnp_ResponseCode']; // Mã phản hồi ('00' = thành công)
      const vnpAmount = verify.vnp_Amount; // Số tiền (đã tự động chia 100 bởi SDK)

      // 3. Tìm payment theo orderCode
      const payment = await this.paymentModel.findOne({ orderCode }).exec();

      if (!payment) {
        return {
          RspCode: '01', // Mã lỗi VNPay: không tìm thấy đơn hàng
          Message: 'Order not found',
        };
      }

      // 4. Verify amount (đảm bảo số tiền khớp với payment trong DB)
      if (payment.amount !== vnpAmount) {
        return {
          RspCode: '04', // Mã lỗi VNPay: số tiền không khớp
          Message: 'Amount mismatch',
        };
      }

      // 5. Check idempotent (nếu payment đã được xử lý rồi thì bỏ qua)
      if (payment.status !== 'pending') {
        return {
          RspCode: '02', // Mã lỗi VNPay: đơn hàng đã được xử lý
          Message: 'Order already processed',
        };
      }

      // 6. Xử lý theo responseCode
      if (responseCode === '00') {
        // Thanh toán thành công → finalize payment (tạo ticket, update seatStates, ...)
        await this.finalizePayment(payment);
        return {
          RspCode: '00', // Thành công
          Message: 'Confirm Success',
        };
      } else {
        // Thanh toán thất bại → update status = failed
        payment.status = 'failed';
        payment.paidAt = undefined;
        await payment.save();
        return {
          RspCode: '00', // Vẫn trả về '00' để VNPay biết đã nhận được IPN
          Message: 'Confirm Success',
        };
      }
    } catch (error) {
      // Xử lý lỗi bất kỳ
      return {
        RspCode: '99', // Mã lỗi VNPay: lỗi hệ thống
        Message: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Xử lý Return URL từ VNPay
   * Sau khi user thanh toán xong, VNPay redirect user về returnUrl với query params.
   * Endpoint này dùng để FE poll status thanh toán (có thể gọi lại nhiều lần nếu IPN chưa xử lý xong).
   * Business logic (tạo ticket, update seatStates) được xử lý ở IPN, nhưng FE có thể poll endpoint này để biết kết quả.
   * @param queryParams - Query params từ VNPay return URL (chứa vnp_TxnRef, vnp_ResponseCode, vnp_SecureHash, ...)
   * @returns Thông tin thanh toán cho FE (để hiển thị kết quả hoặc tiếp tục poll nếu chưa xử lý xong)
   */
  async handleVnpayReturn(queryParams: Record<string, string>): Promise<{
    isSuccess: boolean; // Thanh toán thành công hay không (từ VNPay verify)
    orderCode: string; // Mã đơn hàng
    message: string; // Thông báo
    status: 'pending' | 'success' | 'failed'; // Trạng thái payment trong DB (pending = IPN chưa xử lý xong)
    paymentId?: string; // ID của payment
    amount?: number; // Số tiền thanh toán
    tickets?: Array<{
      // Thông tin đầy đủ của từng ticket để hiển thị vé online
      ticketId: string; // ID của ticket
      qrCode: string; // Mã QR để check-in
      status: 'active' | 'used' | 'refunded'; // Trạng thái vé
      issuedAt: Date; // Thời gian phát hành vé
      checkedInAt?: Date; // Thời gian check-in (nếu đã check-in)
      // Thông tin ghế
      seatRow: string; // Hàng ghế (VD: "A")
      seatNumber: number; // Số ghế (VD: 1)
      seatLabel: string; // Ghế gộp lại (VD: "A-1")
      // Thông tin phim
      movieTitle: string; // Tên phim
      movieDuration?: number; // Thời lượng phim (phút)
      // Thông tin suất chiếu
      showStartTime: Date; // Ngày giờ bắt đầu chiếu
      showEndTime: Date; // Ngày giờ kết thúc chiếu
      screenFormatCode?: string; // Định dạng màn hình (VD: "IMAX", "2D")
      // Thông tin phòng chiếu
      screenName: string; // Tên phòng chiếu (VD: "Screen 01")
      theaterId?: string; // ID rạp (nếu có Theater schema)
      theaterName?: string; // Tên rạp (nếu có Theater schema)
    }>; // Danh sách đầy đủ thông tin tickets (nếu đã thành công)
  }> {
    try {
      // 1. Verify chữ ký từ VNPay
      const verify = this.paymentGatewayService.verifyReturnUrl(queryParams);

      // Nếu chữ ký không hợp lệ → trả về lỗi
      if (!verify.isVerified) {
        return {
          isSuccess: false,
          orderCode: queryParams['vnp_TxnRef'] || 'unknown',
          message: 'Xác thực dữ liệu thất bại',
          status: 'failed',
        };
      }

      // 2. Lấy orderCode từ query params
      const orderCode = verify.vnp_TxnRef || queryParams['vnp_TxnRef'];

      // 3. Tìm payment trong DB để kiểm tra trạng thái thực tế
      const payment = await this.paymentModel.findOne({ orderCode }).exec();

      if (!payment) {
        return {
          isSuccess: verify.isSuccess,
          orderCode,
          message: 'Không tìm thấy payment trong hệ thống',
          status: 'failed',
        };
      }

      // 4. Kiểm tra trạng thái payment trong DB
      // Nếu payment vẫn còn 'pending' → IPN chưa xử lý xong, FE cần poll lại
      if (payment.status === 'pending') {
        return {
          isSuccess: verify.isSuccess, // Kết quả từ VNPay (có thể là success nhưng DB chưa cập nhật)
          orderCode,
          message: 'Đang xử lý thanh toán, vui lòng đợi...',
          status: 'pending', // Báo cho FE biết cần poll lại
          paymentId: payment._id.toString(),
          amount: payment.amount,
        };
      }

      // 5. Payment đã được xử lý (success hoặc failed)
      // Lấy đầy đủ thông tin tickets với populate các relations (movie, show, screen, theater, seat)
      //
      // GIẢI THÍCH POPULATE:
      // - Trước populate: ticket.showId = ObjectId('...') (chỉ là ID string)
      // - Sau populate: ticket.showId = { _id: '...', startTime: Date, movieId: {...} } (là document đầy đủ)
      // - Mongoose tự động query Show collection và thay thế ObjectId bằng document thực tế
      // - Nested populate: populate movieId trong show → Mongoose query Movie collection và thay thế
      // - Kết quả: Chỉ cần 1 query, Mongoose tự động join các collection → Có thể truy cập show.movieId.title
      let tickets: Array<{
        ticketId: string;
        qrCode: string;
        status: 'active' | 'used' | 'refunded';
        issuedAt: Date;
        checkedInAt?: Date;
        seatRow: string;
        seatNumber: number;
        seatLabel: string;
        movieTitle: string;
        movieDuration?: number;
        showStartTime: Date;
        showEndTime: Date;
        screenFormatCode?: string;
        screenName: string;
        theaterId?: string;
        theaterName?: string;
      }> = [];
      if (payment.status === 'success') {
        // Query tickets với populate showId
        // Populate sẽ tự động:
        // 1. Query Show collection → thay ticket.showId (ObjectId) thành Show document
        // 2. Query Movie collection → thay show.movieId (ObjectId) thành Movie document
        // 3. Query Screen collection → thay show.screenId (ObjectId) thành Screen document
        // 4. Query Theater collection → thay screen.theaterId (ObjectId) thành Theater document
        // Kết quả: ticket.showId.movieId.title có thể truy cập trực tiếp (không cần query thêm)
        const ticketDocs = await this.ticketModel
          .find({ paymentId: payment._id })
          .populate({
            path: 'showId', // Populate showId: ObjectId → Show document
            select: 'startTime endTime screenFormatCode',
            populate: [
              {
                path: 'movieId', // Populate movieId trong show: ObjectId → Movie document
                select: 'title duration',
              },
              {
                path: 'screenId', // Populate screenId trong show: ObjectId → Screen document
                select: 'name theaterId',
                populate: {
                  path: 'theaterId', // Populate theaterId trong screen: ObjectId → Theater document
                  select: 'name',
                },
              },
            ],
          })
          .select(
            '_id seatRow seatNumber qrCode status issuedAt checkedInAt showId',
          )
          .exec();

        // Map sang format để trả về cho FE (dễ hiển thị vé online)
        // Lưu ý: Sau populate, t.showId đã là Show document (không phải ObjectId nữa)
        tickets = ticketDocs.map((t) => {
          // t.showId sau populate là Show document, có thể truy cập show.movieId, show.screenId
          const show = t.showId as unknown as ShowDocument;
          const movie = show?.movieId
            ? (show.movieId as unknown as MovieDocument)
            : null;
          const screen = show?.screenId
            ? (show.screenId as unknown as ScreenDocument)
            : null;
          const theater = screen?.theaterId
            ? (screen.theaterId as unknown as any)
            : null;

          return {
            ticketId: t._id.toString(),
            qrCode: t.qrCode,
            status: t.status,
            issuedAt: t.issuedAt,
            checkedInAt: t.checkedInAt,
            // Thông tin ghế
            seatRow: t.seatRow,
            seatNumber: t.seatNumber,
            seatLabel: `${t.seatRow}-${t.seatNumber}`, // Ghế gộp lại (VD: "A-1")
            // Thông tin phim
            movieTitle: movie?.title || 'N/A',
            movieDuration: movie?.duration,
            // Thông tin suất chiếu
            showStartTime: show?.startTime || new Date(),
            showEndTime: show?.endTime || new Date(),
            screenFormatCode: show?.screenFormatCode,
            // Thông tin phòng chiếu
            screenName: screen?.name || 'N/A',
            theaterId: screen?.theaterId
              ? screen.theaterId.toString()
              : undefined,
            theaterName: theater?.name || undefined,
          };
        });
      }

      return {
        isSuccess: payment.status === 'success',
        orderCode,
        message:
          payment.status === 'success'
            ? 'Thanh toán thành công'
            : 'Thanh toán thất bại',
        status:
          payment.status === 'success'
            ? 'success'
            : payment.status === 'failed'
              ? 'failed'
              : 'pending', // Nếu là 'refunded' hoặc status khác, coi như pending
        paymentId: payment._id.toString(),
        amount: payment.amount,
        tickets: payment.status === 'success' ? tickets : undefined,
      };
    } catch (error) {
      return {
        isSuccess: false,
        orderCode: queryParams['vnp_TxnRef'] || 'unknown',
        message: error.message || 'Lỗi xử lý dữ liệu',
        status: 'failed',
      };
    }
  }

  /**
   * Xử lý webhook thanh toán từ cổng (VNPay/MoMo/Stripe...)
   * Đây là điểm vào chung, phần verify chữ ký/amount nên tách riêng theo provider.
   * Ở đây demo đơn giản: nhận orderCode + status + amount, tìm payment và finalize.
   * Lưu ý: Với VNPay, nên dùng handleVnpayIpn thay vì hàm này.
   */
  async handlePaymentWebhook(payload: {
    orderCode: string;
    status: 'success' | 'failed';
    amount: number;
    transactionId?: string;
    provider?: string;
    // meta/rawData?: any; // có thể lưu lại cho audit
  }): Promise<{
    ok: boolean;
    paymentId?: string;
    ticketIds?: string[];
  }> {
    // TODO: verify chữ ký / hash từ cổng thanh toán thực tế tại đây.

    // Tìm payment theo orderCode
    const payment = await this.paymentModel
      .findOne({ orderCode: payload.orderCode })
      .exec();

    if (!payment) {
      throw new NotFoundException('Payment not found for given orderCode');
    }

    // Nếu amount không khớp → có thể reject
    if (payment.amount !== payload.amount) {
      throw new BadRequestException('Amount mismatch for payment');
    }

    // Nếu webhook báo failed → update status = failed
    if (payload.status === 'failed') {
      payment.status = 'failed';
      payment.paidAt = undefined;
      await payment.save();
      return { ok: true, paymentId: payment._id.toString(), ticketIds: [] };
    }

    // status = success → finalize (idempotent)
    const { ticketIds } = await this.finalizePayment(payment);

    return {
      ok: true,
      paymentId: payment._id.toString(),
      ticketIds,
    };
  }
}
