// SeatSelectionGateway - Socket.IO Gateway để broadcast real-time events
// Gateway này xử lý các Socket.IO events liên quan đến chọn ghế

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

// @WebSocketGateway decorator đánh dấu class này là Socket.IO gateway
@WebSocketGateway({
  // CORS: cho phép frontend kết nối từ origin này
  cors: {
    origin: '*', // Trong production nên set cụ thể domain frontend
    credentials: true, // Cho phép gửi cookies
  },
  // Namespace: tất cả events sẽ nằm trong namespace '/seat-selection'
  namespace: '/seat-selection',
})
export class SeatSelectionGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  // Logger để ghi log (dùng Logger của NestJS thay vì console.log)
  private readonly logger = new Logger(SeatSelectionGateway.name);

  // @WebSocketServer decorator inject Socket.IO Server instance
  // Server này dùng để emit events tới tất cả clients
  @WebSocketServer()
  server: Server;

  // onGatewayInit: được gọi khi gateway khởi tạo xong
  afterInit() {
    this.logger.log('✅ SeatSelectionGateway initialized');
  }

  // onGatewayConnection: được gọi khi có client mới kết nối
  handleConnection(client: Socket) {
    // client.id là ID duy nhất của client này (do Socket.IO tự tạo)
    this.logger.log(`🔌 Client connected: ${client.id}`);
  }

  // onGatewayDisconnect: được gọi khi client ngắt kết nối
  handleDisconnect(client: Socket) {
    this.logger.log(`🔌 Client disconnected: ${client.id}`);
  }

  /**
   * Emit event "seat:selecting" tới TẤT CẢ clients trong namespace
   * Khi user bắt đầu chọn ghế (Redis lock thành công)
   */
  emitSeatSelecting(showId: string, seatId: string, userId: string) {
    // server.emit() gửi event tới TẤT CẢ clients đang kết nối
    this.server.emit('seat:selecting', {
      showId, // ID của show
      seatId, // ID của ghế (ví dụ: "A-1")
      userId, // ID của user đang chọn
      status: 'selecting', // Trạng thái ghế
    });
    this.logger.log(
      `📡 Emitted seat:selecting - showId: ${showId}, seatId: ${seatId}, userId: ${userId}`,
    );
  }

  /**
   * Emit event "seat:available" tới TẤT CẢ clients
   * Khi ghế quay về trạng thái available (user bỏ chọn hoặc timeout)
   */
  emitSeatAvailable(showId: string, seatId: string) {
    this.server.emit('seat:available', {
      showId,
      seatId,
      status: 'available',
    });
    this.logger.log(
      `📡 Emitted seat:available - showId: ${showId}, seatId: ${seatId}`,
    );
  }

  /**
   * Emit event "seat:held" tới TẤT CẢ clients
   * Khi ghế đã được đặt trước (reservedTicket tạo thành công)
   */
  emitSeatHeld(showId: string, seatId: string) {
    this.server.emit('seat:held', {
      showId,
      seatId,
      status: 'held',
    });
    this.logger.log(
      `📡 Emitted seat:held - showId: ${showId}, seatId: ${seatId}`,
    );
  }

  /**
   * Emit event "seat:sold" tới TẤT CẢ clients
   * Khi ghế đã được bán (ticket tạo thành công)
   */
  emitSeatSold(showId: string, seatId: string) {
    this.server.emit('seat:sold', {
      showId,
      seatId,
      status: 'sold',
    });
    this.logger.log(
      `📡 Emitted seat:sold - showId: ${showId}, seatId: ${seatId}`,
    );
  }
}
