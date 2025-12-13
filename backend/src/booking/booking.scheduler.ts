// BookingScheduler chạy cron job để tự động hủy các reservedTickets quá hạn
// Chạy mỗi phút để kiểm tra và hủy các vé đã quá 30 phút trước show

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingService } from './booking.service';

@Injectable()
export class BookingScheduler {
  private readonly logger = new Logger(BookingScheduler.name);

  constructor(private readonly bookingService: BookingService) {}

  /**
   * Cron job chạy mỗi phút
   * Kiểm tra và tự động hủy các reservedTickets đã quá hạn
   * reservedUntil < now && status = 'reserved' → chuyển thành 'expired'
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredReservations() {
    this.logger.log('Checking for expired reservations...');

    try {
      const cancelledCount =
        await this.bookingService.cancelExpiredReservations();

      if (cancelledCount > 0) {
        this.logger.log(`Cancelled ${cancelledCount} expired reservation(s)`);
      }
    } catch (error) {
      this.logger.error('Error cancelling expired reservations', error.stack);
    }
  }
}
