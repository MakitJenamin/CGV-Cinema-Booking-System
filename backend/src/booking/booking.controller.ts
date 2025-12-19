// BookingController xử lý HTTP requests liên quan đến đặt vé

import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { BookingService } from './booking.service';
import { PayReservationDto } from './dto/pay-reservation.dto';
import { SelectSeatDto } from './dto/select-seat.dto';
import { CancelSelectingDto } from './dto/cancel-selecting.dto';
import { PayNowSeatsDto } from './dto/pay-now-seats.dto';
import { ReserveSeatsDto } from './dto/reserve-seats.dto';
import { CalculatePriceBreakdownDto } from './dto/calculate-price-breakdown.dto';
import { ExtendLockDto } from './dto/extend-lock.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';

@Controller('booking')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  /**
   * POST /booking/selecting
   * User click chọn ghế → Set Redis lock (TTL 1 phút) → Emit Socket.IO "seat:selecting" → Tính giá cho tất cả ghế đang chọn
   * Yêu cầu: User phải đăng nhập
   * Flow:
   * - Phase 1: User click ghế → Gọi API này với mảng selectedSeats[] → Backend set Redis lock cho ghế mới → Broadcast → Tính giá cho tất cả → Trả về pricing data
   * - Phase 2: FE tận dụng pricing.fullBreakdown đã có, chỉ gọi apply-voucher khi user nhập voucher
   * Body: Mảng SelectSeatDto[] - mỗi phần tử là 1 ghế đang chọn (ghế cuối cùng là ghế vừa chọn)
   */
  @Post('selecting')
  @UseGuards(JwtAuthGuard) // Bắt buộc phải có JWT token
  @HttpCode(HttpStatus.OK)
  async selectSeat(
    @Request() req: any, // req.user được set bởi JwtAuthGuard
    @Body() selectedSeats: SelectSeatDto[], // Client gửi mảng các ghế đang chọn
  ) {
    // req.user.userId được set bởi JwtStrategy.validate()
    // Validate: mảng không được rỗng
    if (!selectedSeats || selectedSeats.length === 0) {
      throw new BadRequestException('At least one seat must be selected');
    }

    // Ghế cuối cùng trong mảng là ghế vừa chọn (cần set lock)
    // Các ghế trước đó đã có lock rồi (từ lần gọi API trước)
    const newSeat = selectedSeats[selectedSeats.length - 1];

    // Gọi service để set Redis lock cho ghế mới, emit Socket.IO event, và tính giá cho tất cả ghế đang chọn
    return await this.bookingService.selectSeat(
      req.user.userId,
      newSeat, // Ghế vừa chọn (cần set lock)
      selectedSeats, // Tất cả ghế đang chọn (để tính giá)
    );
  }

  /**
   * POST /booking/cancel-selecting
   * User bỏ chọn ghế → Xóa Redis lock → Emit Socket.IO "seat:available"
   * Yêu cầu: User phải đăng nhập
   * Flow: User bỏ chọn → Gọi API này → Backend xóa Redis lock → Broadcast tới tất cả clients
   */
  @Post('cancel-selecting')
  @UseGuards(JwtAuthGuard) // Bắt buộc phải có JWT token
  @HttpCode(HttpStatus.OK)
  async cancelSelecting(
    @Request() req: any, // req.user được set bởi JwtAuthGuard
    @Body() cancelSelectingDto: CancelSelectingDto,
  ) {
    // req.user.userId được set bởi JwtStrategy.validate()
    // Gọi service để xóa Redis lock và emit Socket.IO event
    return this.bookingService.cancelSelecting(
      req.user.userId,
      cancelSelectingDto,
    );
  }

  /**
   * POST /booking/apply-voucher
   * Áp dụng voucher và tính lại breakdown giá chi tiết (Phase 2 - khi user nhập voucher)
   * Yêu cầu: User phải đăng nhập
   * Flow: User nhập voucher và ấn "Áp dụng" → Gọi API này → Hiển thị breakdown chi tiết mới (có voucher, tax, rounding)
   */
  @Post('apply-voucher')
  @UseGuards(JwtAuthGuard) // Bắt buộc phải có JWT token
  @HttpCode(HttpStatus.OK)
  async applyVoucher(
    @Request() req: any,
    @Body() calculatePriceBreakdownDto: CalculatePriceBreakdownDto,
  ) {
    // Gọi service để tính lại breakdown giá chi tiết với voucher mới
    return await this.bookingService.calculatePriceBreakdown(
      req.user.userId,
      calculatePriceBreakdownDto,
    );
  }

  /**
   * POST /booking/extend-lock
   * Gia hạn Redis lock thêm 5 phút khi user vào Phase 2 (chọn voucher và thanh toán)
   * Yêu cầu: User phải đăng nhập và đang giữ lock
   * Flow: User ấn "Next" → Gọi API này → Gia hạn lock từ 1 phút lên 6 phút (1 phút còn lại + 5 phút mới)
   */
  @Post('extend-lock')
  @UseGuards(JwtAuthGuard) // Bắt buộc phải có JWT token
  @HttpCode(HttpStatus.OK)
  async extendLock(@Request() req: any, @Body() extendLockDto: ExtendLockDto) {
    // Gọi service để gia hạn Redis lock thêm 5 phút
    return await this.bookingService.extendLock(req.user.userId, extendLockDto);
  }

  /**
   * POST /booking/reserve-multiple
   * User ấn "Đặt trước" cho nhiều ghế cùng lúc → tạo reservedTickets cho từng ghế
   * Yêu cầu: User phải đăng nhập và đã chọn các ghế (có Redis lock)
   * Flow: User đã chọn nhiều ghế → Click "Đặt trước" → Tạo reservedTicket cho từng ghế → Xóa lock → Emit "seat:held"
   */
  @Post('reserve-multiple')
  @UseGuards(JwtAuthGuard) // Bắt buộc phải có JWT token
  @HttpCode(HttpStatus.CREATED)
  async reserveSeats(
    @Request() req: any, // req.user được set bởi JwtAuthGuard
    @Body() reserveSeatsDto: ReserveSeatsDto,
  ) {
    // req.user.userId được set bởi JwtStrategy.validate()
    // Service sẽ kiểm tra Redis lock cho từng ghế trước khi tạo reservedTickets
    return this.bookingService.reserveSeats(req.user.userId, reserveSeatsDto);
  }

  /**
   * POST /booking/pay-now-multiple
   * User thanh toán ngay cho nhiều ghế cùng lúc (không qua reservedTicket)
   * Yêu cầu: User phải đăng nhập và đã chọn các ghế (có Redis lock)
   * Flow: User đã chọn nhiều ghế → Click "Thanh toán ngay" → Tạo payment pending → Trả về URL thanh toán VNPay
   * Sau khi user thanh toán xong, VNPay gọi webhook → Tạo tickets → Update seatStates
   */
  @Post('pay-now-multiple')
  @UseGuards(JwtAuthGuard) // Bắt buộc phải có JWT token
  @HttpCode(HttpStatus.OK)
  async payNowSeats(
    @Request() req: any, // req.user được set bởi JwtAuthGuard
    @Body() payNowSeatsDto: PayNowSeatsDto,
  ) {
    // req.user.userId được set bởi JwtStrategy.validate()
    // Lấy IP của user từ request (VNPay yêu cầu)
    // Xử lý các trường hợp: x-forwarded-for (proxy), connection.remoteAddress, socket.remoteAddress, req.ip
    const ipAddr =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.ip ||
      '127.0.0.1';

    // Lấy returnUrl từ body (FE gửi lên) hoặc dùng default
    // returnUrl là URL FE nhận kết quả sau khi user thanh toán xong (VNPay redirect về đây)
    const returnUrl =
      payNowSeatsDto.returnUrl ||
      `${req.protocol}://${req.get('host')}/payment-result`;

    // Service sẽ kiểm tra Redis lock cho tất cả ghế trước khi thanh toán
    // Tạo 1 payment (status = pending) và trả về URL thanh toán VNPay
    return this.bookingService.payNowSeats(
      req.user.userId,
      payNowSeatsDto,
      ipAddr,
      returnUrl,
    );
  }

  /**
   * POST /booking/pay
   * Staff thanh toán reservedTicket tại quầy
   * Yêu cầu: Staff hoặc Admin role
   */
  @Post('pay')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('staff', 'admin')
  @HttpCode(HttpStatus.OK)
  async payReservation(@Body() payReservationDto: PayReservationDto) {
    return this.bookingService.payReservation(payReservationDto);
  }

  /**
   * GET /booking/shows/:showId/seats-view
   * Trả về view đã gộp:
   * - show
   * - movie
   * - screen
   * - seats (đã merge trạng thái available/held/sold/blocked)
   * Public: khách chưa login vẫn xem sơ đồ ghế được.
   */
  @Get('shows/:showId/seats-view')
  @Public()
  async getSeatsView(@Param('showId') showId: string) {
    return this.bookingService.getSeatsView(showId);
  }

  /**
   * GET /booking/reservation/:code
   * Tra cứu thông tin reservedTicket theo mã đặt chỗ
   * Dùng cho staff kiểm tra khi khách đến quầy
   */
  @Get('reservation/:code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('staff', 'admin')
  getReservation(@Param('code') code: string) {
    // TODO: Implement getReservation method in service
    return { message: 'Get reservation by code', code };
  }

  /**
   * GET /booking/payments/vnpay-ipn
   * Endpoint để VNPay gọi về (IPN - Instant Payment Notification) sau khi user thanh toán.
   * VNPay gửi GET request với query params chứa thông tin thanh toán.
   * Endpoint này là public (không cần JWT), nhưng phải verify chữ ký từ VNPay.
   * Đây là nơi xử lý business logic (tạo ticket, update seatStates, ...)
   */
  @Get('payments/vnpay-ipn')
  @Public()
  @HttpCode(HttpStatus.OK)
  async vnpayIpn(@Request() req: any) {
    // VNPay gửi query params trong URL, không phải body
    // Lấy tất cả query params từ request
    const queryParams = req.query as Record<string, string>;

    // Gọi service để verify và xử lý IPN
    return await this.bookingService.handleVnpayIpn(queryParams);
  }

  /**
   * GET /booking/payments/vnpay-return
   * Endpoint để FE nhận kết quả sau khi user thanh toán xong (VNPay redirect về đây).
   * VNPay redirect user về returnUrl với query params chứa thông tin thanh toán.
   *
   * Flow:
   * 1. User thanh toán xong → VNPay redirect về returnUrl với query params
   * 2. FE gọi endpoint này với query params từ VNPay
   * 3. Nếu payment.status = 'pending' (IPN chưa xử lý xong) → FE retry gọi lại endpoint này
   * 4. Khi payment.status = 'success' hoặc 'failed' → FE hiển thị kết quả
   *
   * Endpoint này là public (không cần JWT), nhưng phải verify chữ ký từ VNPay.
   * Business logic (tạo ticket, update seatStates) được xử lý ở IPN, nhưng FE poll endpoint này để biết kết quả.
   */
  @Get('payments/vnpay-return')
  @Public()
  @HttpCode(HttpStatus.OK)
  async vnpayReturn(@Request() req: any) {
    // VNPay redirect về với query params trong URL
    const queryParams = req.query as Record<string, string>;

    // Gọi service để verify return URL và trả về thông tin cho FE
    // Nếu payment.status = 'pending', FE sẽ retry gọi lại endpoint này
    return await this.bookingService.handleVnpayReturn(queryParams);
  }
}
