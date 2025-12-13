// Hàm này gom toàn bộ cấu hình từ biến môi trường (.env)
// thành một object duy nhất để dùng trong toàn bộ ứng dụng qua ConfigService.
export default () => ({
  // Môi trường chạy hiện tại của app: development | production | test
  nodeEnv: process.env.NODE_ENV ?? 'development',
  // Cổng mà NestJS sẽ lắng nghe, đọc từ PORT (string) và parse sang number
  port: parseInt(process.env.PORT ?? '3000', 10),
  database: {
    // URI kết nối đến MongoDB Atlas (database rapPhim)
    uri: process.env.MONGODB_URI ?? '',
  },
  redis: {
    // URL kết nối đến Redis (dùng để cache, giữ ghế, v.v.)
    url: process.env.REDIS_URL ?? '',
  },
  auth: {
    jwt: {
      // Secret dùng để ký JWT. Ưu tiên lấy từ biến môi trường,
      // nếu không có thì dùng chuỗi mặc định phía sau (chỉ nên dùng khi dev).
      accessSecret:
        process.env.JWT_ACCESS_SECRET ??
        'aaf2644e7f2ebfb169451829cd45b7b0446eb4d7677b2ec3a43d132636d26e51',
      // Thời gian hết hạn của access token, VD: '15m' = 15 phút
      accessExpiresIn: process.env.JWT_ACCESS_EXPIRES ?? '15m',
    },
  },
  cookies: {
    // Domain áp dụng cho cookie (frontend sẽ truy cập qua domain này)
    domain: process.env.COOKIE_DOMAIN ?? 'localhost',
    // Có bật cookie chỉ gửi qua HTTPS hay không (true khi chạy production với HTTPS)
    secure: (process.env.COOKIE_SECURE ?? 'false').toLowerCase() === 'true',
  },
});
