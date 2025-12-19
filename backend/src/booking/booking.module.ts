// BookingModule quản lý đặt vé, giữ ghế, thanh toán

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { BookingService } from './booking.service';
import { BookingController } from './booking.controller';
import { BookingScheduler } from './booking.scheduler';
import {
  ReservedTicket,
  ReservedTicketSchema,
} from './schemas/reserved-ticket.schema';
import { Show, ShowSchema } from './schemas/show.schema';
import { Seat, SeatSchema } from './schemas/seat.schema';
import { Movie, MovieSchema } from './schemas/movie.schema';
import { Screen, ScreenSchema } from './schemas/screen.schema';
import { Ticket, TicketSchema } from './schemas/ticket.schema';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { PriceQuote, PriceQuoteSchema } from './schemas/price-quote.schema';
import {
  PricingAudit,
  PricingAuditSchema,
} from './schemas/pricing-audit.schema';
import { AuthModule } from '../auth/auth.module';
// Import Redis provider để inject Redis client vào BookingService
import { redisProvider } from './providers/redis.provider';
// Import Socket.IO gateway để emit real-time events
import { SeatSelectionGateway } from './gateways/seat-selection.gateway';
// Import PricingService để tính giá
import { PricingService } from './pricing.service';
// Import PaymentGatewayService mô phỏng cổng thanh toán online (QR / Credit Card)
import { PaymentGatewayService } from './payment-gateway.service';

@Module({
  imports: [
    // ScheduleModule để dùng cron jobs
    ScheduleModule.forRoot(),
    // Import AuthModule để dùng JwtAuthGuard và RolesGuard
    AuthModule,
    // Đăng ký schemas (tất cả các collection liên quan đến booking)
    MongooseModule.forFeature([
      { name: ReservedTicket.name, schema: ReservedTicketSchema },
      { name: Show.name, schema: ShowSchema },
      { name: Seat.name, schema: SeatSchema },
      { name: Movie.name, schema: MovieSchema },
      { name: Screen.name, schema: ScreenSchema },
      { name: Ticket.name, schema: TicketSchema }, // Schema cho vé đã bán
      { name: Payment.name, schema: PaymentSchema }, // Schema cho giao dịch thanh toán
      { name: PriceQuote.name, schema: PriceQuoteSchema }, // Schema cho báo giá tạm thời
      { name: PricingAudit.name, schema: PricingAuditSchema }, // Schema cho audit log tính giá
    ]),
  ],
  controllers: [BookingController],
  // providers: danh sách các service/provider có thể inject vào các class khác
  providers: [
    BookingService, // Service chứa business logic
    BookingScheduler, // Cron job để hủy reservations hết hạn
    PricingService, // Service tính toán giá vé
    PaymentGatewayService, // Service mô phỏng cổng thanh toán (QR, Credit Card)
    redisProvider, // Redis client provider (dùng để làm distributed lock)
    SeatSelectionGateway, // Socket.IO gateway để broadcast events
  ],
  exports: [BookingService], // Export để module khác có thể dùng
})
export class BookingModule {}
