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
import { ReserveSeatDto } from './dto/reserve-seat.dto';
import { PayReservationDto } from './dto/pay-reservation.dto';
import { SelectSeatDto } from './dto/select-seat.dto';
import { CancelSelectingDto } from './dto/cancel-selecting.dto';
import { PayNowDto } from './dto/pay-now.dto';
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
  ) {}

  /**
   * Đặt trước ghế (user ấn nút "Đặt trước")
   * Logic: reservedUntil = show.startTime - 30 phút
   * Flow: User đã chọn ghế (có Redis lock) → Click "Đặt trước" → Tạo reservedTicket → Xóa lock → Emit "seat:held"
   * @param userId - ID của user đặt vé
   * @param reserveSeatDto - Thông tin ghế muốn đặt
   * @returns ReservedTicket đã tạo
   */
  async reserveSeat(
    userId: string,
    reserveSeatDto: ReserveSeatDto,
  ): Promise<ReservedTicketDocument> {
    // 1. Tạo Redis key và seatKey
    const seatKey = `${reserveSeatDto.seatRow}-${reserveSeatDto.seatNumber}`;
    const redisKey = `seat:selecting:${reserveSeatDto.showId}:${seatKey}`;

    // 2. Kiểm tra Redis lock có tồn tại không và phải là của user này
    // User phải đã chọn ghế (selectSeat) trước khi có thể đặt trước
    const lockOwner = await this.redisClient.get(redisKey);
    if (!lockOwner || lockOwner !== userId) {
      throw new BadRequestException(
        'You must select the seat first before reserving',
      );
    }

    // 3. Kiểm tra show có tồn tại không
    const show = await this.showModel.findById(reserveSeatDto.showId).exec();
    if (!show || !show.isActive) {
      throw new NotFoundException('Show not found or inactive');
    }

    // 4. Kiểm tra show chưa bắt đầu chiếu
    if (new Date() >= show.startTime) {
      throw new BadRequestException('Show has already started');
    }

    // 5. Tính thời gian hết hạn = show.startTime - 30 phút
    const reservedUntil = new Date(show.startTime);
    reservedUntil.setMinutes(reservedUntil.getMinutes() - 30);

    // 6. Kiểm tra còn đủ thời gian để đặt (ít nhất 30 phút trước khi chiếu)
    if (new Date() >= reservedUntil) {
      throw new BadRequestException(
        'Cannot reserve seat: less than 30 minutes before show time',
      );
    }

    // 7. Kiểm tra ghế có đang available/selecting không (không được sold hoặc held)
    const currentSeatState = show.seatStates.get(seatKey);
    if (currentSeatState) {
      if (currentSeatState.status === 'sold') {
        throw new ConflictException('Seat is already sold');
      }
      if (currentSeatState.status === 'held') {
        // Kiểm tra reservedTicket còn valid không
        const existingReservation = await this.reservedTicketModel
          .findById(currentSeatState.reservedTicketId)
          .exec();

        if (
          existingReservation &&
          existingReservation.status === 'reserved' &&
          new Date() < existingReservation.reservedUntil
        ) {
          throw new ConflictException('Seat is already reserved');
        }
        // Nếu reservedTicket đã hết hạn → có thể đặt lại
      }
      if (currentSeatState.status === 'blocked') {
        throw new BadRequestException('Seat is blocked');
      }
    }

    // 8. Tạo mã đặt chỗ ngẫu nhiên (VD: RSV-8F3K9Q)
    const reservationCode = this.generateReservationCode();

    // 9. Tạo reservedTicket trong MongoDB
    const reservedTicket = new this.reservedTicketModel({
      userId: new Types.ObjectId(userId),
      showId: new Types.ObjectId(reserveSeatDto.showId),
      seatId: new Types.ObjectId(reserveSeatDto.seatId),
      seatRow: reserveSeatDto.seatRow,
      seatNumber: reserveSeatDto.seatNumber,
      reservationCode,
      reservedUntil,
      status: 'reserved',
      channel: 'online',
    });

    await reservedTicket.save();

    // 10. Cập nhật seatStates trong show = "held"
    show.seatStates.set(seatKey, {
      status: 'held',
      ticketId: null,
      reservedTicketId: reservedTicket._id,
      updatedAt: new Date(),
    });

    await show.save();

    // 11. Xóa Redis lock (vì đã đặt trước xong, không cần lock nữa)
    await this.redisClient.del(redisKey);

    // 12. Emit Socket.IO event "seat:held" tới TẤT CẢ clients
    // Tất cả clients sẽ cập nhật UI: ghế chuyển sang màu "held"
    this.seatSelectionGateway.emitSeatHeld(reserveSeatDto.showId, seatKey);

    // 13. Trả về reservedTicket đã tạo
    return reservedTicket;
  }

  /**
   * Thanh toán reservedTicket tại quầy (staff xử lý)
   * @param payReservationDto - Mã đặt chỗ và phương thức thanh toán
   * @returns Thông tin thanh toán thành công
   */
  async payReservation(
    payReservationDto: PayReservationDto,
  ): Promise<{ message: string; ticketId: string }> {
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

      // Cập nhật seatStates về available
      const show = await this.showModel.findById(reservedTicket.showId).exec();
      if (show) {
        const seatKey = `${reservedTicket.seatRow}-${reservedTicket.seatNumber}`;
        show.seatStates.set(seatKey, {
          status: 'available',
          ticketId: null,
          reservedTicketId: null,
          updatedAt: new Date(),
        });
        await show.save();
      }

      throw new BadRequestException(
        'Reservation has expired. Seat is now available.',
      );
    }

    // 3. TODO: Tạo payment record (sẽ làm sau khi có payments module)
    // 4. TODO: Tạo ticket record (sẽ làm sau khi có tickets module)

    // 5. Cập nhật reservedTicket status = 'paid'
    reservedTicket.status = 'paid';
    await reservedTicket.save();

    // 6. Cập nhật seatStates = 'sold'
    const show = await this.showModel.findById(reservedTicket.showId).exec();
    if (show) {
      const seatKey = `${reservedTicket.seatRow}-${reservedTicket.seatNumber}`;
      show.seatStates.set(seatKey, {
        status: 'sold',
        ticketId: null, // TODO: set ticketId khi tạo ticket
        reservedTicketId: reservedTicket._id,
        updatedAt: new Date(),
      });
      await show.save();
    }

    return {
      message: 'Payment successful',
      ticketId: 'TODO', // TODO: trả về ticketId thật
    };
  }

  /**
   * Tự động hủy các reservedTickets đã quá hạn
   * Hàm này được gọi bởi cron job mỗi phút
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
      // Cập nhật status = 'expired'
      reservation.status = 'expired';
      await reservation.save();

      // Cập nhật seatStates trong show về 'available'
      const show = await this.showModel.findById(reservation.showId).exec();

      if (show) {
        const seatKey = `${reservation.seatRow}-${reservation.seatNumber}`;
        const currentState = show.seatStates.get(seatKey);

        // Chỉ cập nhật nếu ghế vẫn đang ở trạng thái 'held' và reservedTicketId match
        if (
          currentState?.status === 'held' &&
          currentState.reservedTicketId?.toString() ===
            reservation._id.toString()
        ) {
          show.seatStates.set(seatKey, {
            status: 'available',
            ticketId: null,
            reservedTicketId: null,
            updatedAt: new Date(),
          });
          await show.save();
        }
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
   * Flow: User click ghế → Set Redis lock (TTL 1 phút) → Emit Socket.IO event
   * @param userId - ID của user đang chọn ghế
   * @param selectSeatDto - Thông tin ghế muốn chọn
   * @returns Thông báo thành công hoặc lỗi
   */
  async selectSeat(
    userId: string,
    selectSeatDto: SelectSeatDto,
  ): Promise<{ message: string; seatId: string }> {
    // 1. Tạo Redis key theo format: seat:selecting:{showId}:{seatRow}-{seatNumber}
    // Ví dụ: seat:selecting:show123:A-1
    const seatKey = `${selectSeatDto.seatRow}-${selectSeatDto.seatNumber}`;
    const redisKey = `seat:selecting:${selectSeatDto.showId}:${seatKey}`;

    // 2. Kiểm tra show có tồn tại không
    const show = await this.showModel.findById(selectSeatDto.showId).exec();
    if (!show || !show.isActive) {
      throw new NotFoundException('Show not found or inactive');
    }

    // 3. Kiểm tra ghế có tồn tại không
    const seat = await this.seatModel.findById(selectSeatDto.seatId).exec();
    if (!seat || !seat.isActive) {
      throw new NotFoundException('Seat not found or inactive');
    }

    // 4. Kiểm tra ghế có đang available không (từ seatStates trong show)
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

    // 5. Thực hiện Redis SET với NX (chỉ set nếu key chưa tồn tại) và EX (TTL = 60 giây)
    // SET NX EX là atomic operation → đảm bảo chỉ 1 user có thể set lock tại 1 thời điểm
    const lockResult = await this.redisClient.set(
      redisKey, // Key
      userId, // Value = userId để biết ai đang giữ lock
      'EX', // Set TTL (expiry time)
      60, // TTL = 60 giây (1 phút)
      'NX', // Chỉ set nếu key chưa tồn tại (Not eXists)
    );

    // 6. Kiểm tra kết quả SET
    // Nếu lockResult === 'OK' → thành công, user này giữ lock
    // Nếu lockResult === null → thất bại, ghế đang được chọn bởi user khác
    if (lockResult !== 'OK') {
      throw new ConflictException('Seat is being selected by another user');
    }

    // 7. Emit Socket.IO event "seat:selecting" tới TẤT CẢ clients
    // Tất cả clients (kể cả user hiện tại) sẽ cập nhật UI: ghế chuyển sang màu "selecting"
    this.seatSelectionGateway.emitSeatSelecting(
      selectSeatDto.showId,
      seatKey,
      userId,
    );

    // 8. Trả về thông báo thành công
    return {
      message: 'Seat selected successfully',
      seatId: seatKey,
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
   * Thanh toán ngay (pay-now) - Thanh toán không qua reservedTicket
   * Flow đầy đủ:
   * 1. Kiểm tra Redis lock
   * 2. Validate show, seat, seatState
   * 3. Tính giá (dùng PricingService)
   * 4. Validate quote (nếu có quoteId)
   * 5. Tạo Payment record
   * 6. Tạo Ticket record
   * 7. Cập nhật show.seatStates = "sold"
   * 8. Tạo PricingAudit log
   * 9. Xóa Redis lock
   * 10. Emit Socket.IO event "seat:sold"
   * @param userId - ID của user thanh toán
   * @param payNowDto - Thông tin ghế, phương thức thanh toán, voucherCode (optional), quoteId (optional)
   * @returns Thông tin ticket và payment đã tạo
   */
  async payNow(
    userId: string,
    payNowDto: PayNowDto,
  ): Promise<{
    message: string;
    ticketId: string;
    paymentId: string;
    qrCode: string;
    amount: number;
    breakdown: any[];
  }> {
    // ========== BƯỚC 1: KIỂM TRA REDIS LOCK ==========

    // 1.1. Tạo Redis key và seatKey
    // seatKey: "A-1" (row-number) - dùng để map với seatStates trong show
    const seatKey = `${payNowDto.seatRow}-${payNowDto.seatNumber}`;
    // redisKey: "seat:selecting:showId:A-1" - key trong Redis để lock ghế
    const redisKey = `seat:selecting:${payNowDto.showId}:${seatKey}`;

    // 1.2. Kiểm tra Redis lock có tồn tại không và phải là của user này
    // GET để lấy value (userId) của key trong Redis
    const lockOwner = await this.redisClient.get(redisKey);
    // Nếu không có lock hoặc lock không phải của user này → báo lỗi
    // User phải đã chọn ghế (selectSeat) trước khi có thể thanh toán
    if (!lockOwner || lockOwner !== userId) {
      throw new BadRequestException(
        'You must select the seat first before paying',
      );
    }

    // ========== BƯỚC 2: VALIDATE SHOW, SEAT, SEATSTATE ==========

    // 2.1. Kiểm tra show có tồn tại không và đang active
    const show = await this.showModel.findById(payNowDto.showId).exec();
    if (!show || !show.isActive) {
      throw new NotFoundException('Show not found or inactive');
    }

    // 2.2. Kiểm tra ghế có tồn tại không và đang active
    const seat = await this.seatModel.findById(payNowDto.seatId).exec();
    if (!seat || !seat.isActive) {
      throw new NotFoundException('Seat not found or inactive');
    }

    // 2.3. Kiểm tra ghế có đang available/selecting không (không được sold hoặc held)
    // seatStates là Map<string, SeatState> - lưu trạng thái từng ghế trong show
    const currentSeatState = show.seatStates.get(seatKey);
    if (currentSeatState) {
      // Nếu ghế đã sold → không thể mua nữa
      if (currentSeatState.status === 'sold') {
        throw new ConflictException('Seat is already sold');
      }
      // Nếu ghế đã held (có người đặt trước) → không thể mua nữa
      if (currentSeatState.status === 'held') {
        throw new ConflictException('Seat is already reserved');
      }
    }

    // ========== BƯỚC 3: TÍNH GIÁ (DÙNG PRICINGSERVICE) ==========

    // 3.1. Gọi PricingService để tính giá đầy đủ theo pipeline
    // Pipeline: basePrice → surcharges → discounts → tax → rounding
    const pricingResult = await this.pricingService.calculatePrice(
      payNowDto.showId, // showId để lấy movie, screen, screenFormat
      payNowDto.seatId, // seatId để lấy seatType
      userId, // userId để lấy membership tier
      payNowDto.voucherCode, // voucherCode (optional) để áp dụng voucher
    );

    // 3.2. Validate quote (nếu có quoteId)
    // Nếu user đã có quote trước đó, kiểm tra giá có thay đổi không
    if (payNowDto.quoteId) {
      // Tìm priceQuote trong DB
      const quote = await this.priceQuoteModel
        .findOne({ quoteId: payNowDto.quoteId })
        .exec();
      // Kiểm tra quote có tồn tại, chưa hết hạn, và userId match
      if (
        !quote ||
        quote.expiresAt < new Date() ||
        quote.userId.toString() !== userId ||
        quote.showId.toString() !== payNowDto.showId
      ) {
        throw new BadRequestException('Invalid or expired quote');
      }
      // Kiểm tra giá có thay đổi không (cho phép sai số nhỏ do rounding)
      const priceDiff = Math.abs(quote.price - pricingResult.grandTotal);
      if (priceDiff > 1000) {
        // Nếu chênh lệch > 1000 VND → giá đã thay đổi, không cho thanh toán với quote cũ
        throw new BadRequestException(
          'Price has changed. Please refresh and try again.',
        );
      }
    }

    // ========== BƯỚC 4: TẠO PAYMENT RECORD ==========

    // 4.1. Tạo payment record trong MongoDB
    // Payment lưu thông tin giao dịch thanh toán (có thể mua nhiều vé trong 1 payment)
    const payment = new this.paymentModel({
      userId: new Types.ObjectId(userId), // User thanh toán
      promoCode: payNowDto.voucherCode, // Mã voucher (nếu có)
      amount: pricingResult.grandTotal, // Tổng số tiền thanh toán (sau khi áp dụng tất cả)
      currency: 'VND', // Đơn vị tiền tệ
      provider: this.mapPaymentMethodToProvider(payNowDto.paymentMethod), // Nhà cung cấp (vnpay, momo, zalopay, credit_card)
      paymentMethod: payNowDto.paymentMethod, // Phương thức thanh toán (qr, card, wallet)
      status: 'success', // Trạng thái: pending → success (tạm thời set success, sau sẽ tích hợp payment gateway)
      transactionId: this.generateTransactionId(), // Transaction ID (tạm thời generate, sau sẽ lấy từ gateway)
      paidAt: new Date(), // Thời gian thanh toán thành công
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
          amount: Math.abs(item.amount), // Lưu số dương
        })), // Chi tiết các khoản giảm giá
      fees: [], // Không có booking fee (theo yêu cầu)
      tax: {
        name: 'VAT 8%',
        amount: pricingResult.totalTax,
      }, // Chi tiết thuế
      roundedDelta: pricingResult.roundedDelta, // Chênh lệch do làm tròn
    });
    // Lưu payment vào MongoDB
    await payment.save();

    // ========== BƯỚC 5: TẠO TICKET RECORD ==========

    // 5.1. Generate QR code duy nhất cho vé
    // QR code dùng để check-in tại rạp (format: CGV + timestamp + random)
    const qrCode = this.generateQRCode();

    // 5.2. Tạo ticket record trong MongoDB
    // Ticket đại diện cho 1 ghế đã được thanh toán thành công
    const ticket = new this.ticketModel({
      paymentId: payment._id, // Link đến payment record
      userId: new Types.ObjectId(userId), // User mua vé
      showId: new Types.ObjectId(payNowDto.showId), // Show (suất chiếu)
      seatId: new Types.ObjectId(payNowDto.seatId), // Ghế đã mua
      seatRow: payNowDto.seatRow, // Row của ghế (VD: "A")
      seatNumber: payNowDto.seatNumber, // Số ghế trong row (VD: 1)
      qrCode: qrCode, // QR code để check-in
      status: 'active', // Trạng thái: active → used (khi check-in) → refunded (nếu hoàn tiền)
      checkedInAt: null, // Chưa check-in
      issuedAt: new Date(), // Thời gian phát hành vé (khi thanh toán thành công)
    });
    // Lưu ticket vào MongoDB
    await ticket.save();

    // ========== BƯỚC 6: CẬP NHẬT SHOW.SEATSTATES = "SOLD" ==========

    // 6.1. Cập nhật seatStates trong show = "sold"
    // seatStates là Map<string, SeatState> - lưu trạng thái từng ghế
    show.seatStates.set(seatKey, {
      status: 'sold', // Trạng thái: sold (đã bán)
      ticketId: ticket._id, // Link đến ticket record
      reservedTicketId: null, // Không có reservedTicket (vì thanh toán ngay)
      updatedAt: new Date(), // Thời gian cập nhật
    });
    // Lưu show vào MongoDB
    await show.save();

    // ========== BƯỚC 7: TẠO PRICING AUDIT LOG ==========

    // 7.1. Tạo pricingAudit để log chi tiết quá trình tính giá (để debug/audit)
    const audit = new this.pricingAuditModel({
      quoteId: payNowDto.quoteId, // Quote ID (nếu có)
      userId: new Types.ObjectId(userId), // User yêu cầu tính giá
      showId: new Types.ObjectId(payNowDto.showId), // Show
      seats: [
        {
          seatId: new Types.ObjectId(payNowDto.seatId),
          type: seat.seatTypeCode,
        },
      ], // Danh sách ghế
      pipeline: pricingResult.breakdown.map((item) => ({
        step: item.type.toLowerCase(), // Tên bước (base, surcharge, discount, tax, rounding)
        amount: item.amount, // Số tiền thay đổi
        meta: item.meta, // Metadata bổ sung
      })), // Pipeline chi tiết từng bước tính giá
      priceBefore: pricingResult.basePrice, // Giá ban đầu (basePrice)
      priceAfter: pricingResult.grandTotal, // Giá cuối cùng (sau khi áp dụng tất cả)
    });
    // Lưu audit vào MongoDB
    await audit.save();

    // ========== BƯỚC 8: XÓA REDIS LOCK ==========

    // 8.1. Xóa Redis lock (vì đã thanh toán xong, không cần lock nữa)
    // DEL key trong Redis
    await this.redisClient.del(redisKey);

    // ========== BƯỚC 9: EMIT SOCKET.IO EVENT "SEAT:SOLD" ==========

    // 9.1. Emit Socket.IO event "seat:sold" tới TẤT CẢ clients
    // Tất cả clients (kể cả user hiện tại) sẽ cập nhật UI: ghế chuyển sang màu "sold"
    this.seatSelectionGateway.emitSeatSold(payNowDto.showId, seatKey);

    // ========== BƯỚC 10: TRẢ VỀ KẾT QUẢ ==========

    // 10.1. Trả về thông tin ticket, payment, và breakdown
    return {
      message: 'Payment successful',
      ticketId: ticket._id.toString(), // ID của ticket
      paymentId: payment._id.toString(), // ID của payment
      qrCode: qrCode, // QR code để check-in
      amount: pricingResult.grandTotal, // Tổng số tiền thanh toán
      breakdown: pricingResult.breakdown, // Chi tiết từng bước tính giá
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
}
