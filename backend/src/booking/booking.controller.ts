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
} from '@nestjs/common';
import { BookingService } from './booking.service';
import { ReserveSeatDto } from './dto/reserve-seat.dto';
import { PayReservationDto } from './dto/pay-reservation.dto';
import { SelectSeatDto } from './dto/select-seat.dto';
import { CancelSelectingDto } from './dto/cancel-selecting.dto';
import { PayNowDto } from './dto/pay-now.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';

@Controller('booking')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  /**
   * POST /booking/selecting
   * User click chọn ghế → Set Redis lock (TTL 1 phút) → Emit Socket.IO "seat:selecting"
   * Yêu cầu: User phải đăng nhập
   * Flow: User click ghế → Gọi API này → Backend set Redis lock → Broadcast tới tất cả clients
   */
  @Post('selecting')
  @UseGuards(JwtAuthGuard) // Bắt buộc phải có JWT token
  @HttpCode(HttpStatus.OK)
  async selectSeat(
    @Request() req: any, // req.user được set bởi JwtAuthGuard
    @Body() selectSeatDto: SelectSeatDto,
  ) {
    // req.user.userId được set bởi JwtStrategy.validate()
    // Gọi service để set Redis lock và emit Socket.IO event
    return this.bookingService.selectSeat(req.user.userId, selectSeatDto);
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
   * POST /booking/reserve
   * User ấn "Đặt trước" → tạo reservedTicket
   * Yêu cầu: User phải đăng nhập và đã chọn ghế (có Redis lock)
   * Flow: User đã chọn ghế → Click "Đặt trước" → Tạo reservedTicket → Xóa lock → Emit "seat:held"
   */
  @Post('reserve')
  @UseGuards(JwtAuthGuard) // Bắt buộc phải có JWT token
  @HttpCode(HttpStatus.CREATED)
  async reserveSeat(
    @Request() req: any, // req.user được set bởi JwtAuthGuard
    @Body() reserveSeatDto: ReserveSeatDto,
  ) {
    // req.user.userId được set bởi JwtStrategy.validate()
    // Service sẽ kiểm tra Redis lock trước khi tạo reservedTicket
    return this.bookingService.reserveSeat(req.user.userId, reserveSeatDto);
  }

  /**
   * POST /booking/pay-now
   * User thanh toán ngay (không qua reservedTicket)
   * Yêu cầu: User phải đăng nhập và đã chọn ghế (có Redis lock)
   * Flow: User đã chọn ghế → Click "Thanh toán ngay" → Tạo ticket → Xóa lock → Emit "seat:sold"
   */
  @Post('pay-now')
  @UseGuards(JwtAuthGuard) // Bắt buộc phải có JWT token
  @HttpCode(HttpStatus.OK)
  async payNow(
    @Request() req: any, // req.user được set bởi JwtAuthGuard
    @Body() payNowDto: PayNowDto,
  ) {
    // req.user.userId được set bởi JwtStrategy.validate()
    // Service sẽ kiểm tra Redis lock trước khi thanh toán
    return this.bookingService.payNow(req.user.userId, payNowDto);
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
}
