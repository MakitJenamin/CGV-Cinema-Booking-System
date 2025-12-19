# Hướng dẫn Test Flow Reserve Seats bằng Postman

## 📋 Dữ liệu Test từ MongoDB

### Thông tin cơ bản:

- **User ID**: `671b9600d34b23f0a4b9e502`
- **Email**: `user2@example.com`
- **Show ID**: `671b9500d34b23f0a4b9e402`
- **Screen ID**: `671b9410d34b23f0a4b9e302`
- **Show Start Time**: `2025-03-01T18:00:00.000Z` (Sun Mar 02 2025 01:00:00 GMT+0700)
- **Reserved Until**: `2025-03-01T17:30:00.000Z` (30 phút trước khi show bắt đầu)

### Seats có sẵn:

1. **Seat A-3**: `69384cf75f7fa3c9bae26188`
2. **Seat A-7**: `69384cf75f7fa3c9bae2618c`
3. **Seat A-10**: `69384cf75f7fa3c9bae2618f`
4. **Seat A-12**: `69384cf75f7fa3c9bae26191`
5. **Seat A-13**: `69384cf75f7fa3c9bae26192`

---

## 🔑 Bước 1: Đăng nhập để lấy JWT Token

### Request:

```
POST http://localhost:3000/auth/login
Content-Type: application/json
```

### Body:

```json
{
  "email": "user2@example.com",
  "password": "password"
}
```

### Response:

- Cookie: `access_token=<JWT_TOKEN>`
- Copy token này để dùng cho các request sau

### Postman Setup:

1. Vào **Tests** tab
2. Thêm script để lưu token:

```javascript
// Lưu token từ cookie
const cookies = pm.response.headers.get('Set-Cookie');
if (cookies) {
  const tokenMatch = cookies.match(/access_token=([^;]+)/);
  if (tokenMatch) {
    pm.environment.set('access_token', tokenMatch[1]);
  }
}
```

---

## 📍 Bước 2: Xem sơ đồ ghế (Public - không cần auth)

### Request:

```
GET http://localhost:3000/booking/shows/671b9500d34b23f0a4b9e402/seats-view
```

### Response:

- `show`: Thông tin suất chiếu
- `movie`: Thông tin phim
- `screen`: Thông tin phòng chiếu
- `seats`: Mảng ghế với status (available/held/sold/blocked)

---

## 🎯 Bước 3: Chọn ghế (Selecting) - Cần auth

### Request:

```
POST http://localhost:3000/booking/selecting
Content-Type: application/json
Cookie: access_token={{access_token}}
```

### Body (Chọn 1 ghế):

```json
{
  "showId": "671b9500d34b23f0a4b9e402",
  "seatId": "69384cf75f7fa3c9bae26188",
  "seatRow": "A",
  "seatNumber": 3
}
```

### Response:

```json
{
  "message": "Seat selected successfully",
  "seatId": "A-3"
}
```

### Lưu ý:

- Redis lock được set với TTL = 60 giây (1 phút)
- Socket.IO event `seat:selecting` được emit tới tất cả clients
- Ghế sẽ tự động unlock sau 1 phút nếu không thanh toán

---

## 🎫 Bước 4: Đặt trước nhiều ghế (Reserve Multiple) - Cần auth

### Request:

```
POST http://localhost:3000/booking/reserve-multiple
Content-Type: application/json
Cookie: access_token={{access_token}}
```

### Body (Đặt trước 3 ghế):

```json
{
  "showId": "671b9500d34b23f0a4b9e402",
  "seats": [
    {
      "seatId": "69384cf75f7fa3c9bae26188",
      "seatRow": "A",
      "seatNumber": 3
    },
    {
      "seatId": "69384cf75f7fa3c9bae2618c",
      "seatRow": "A",
      "seatNumber": 7
    },
    {
      "seatId": "69384cf75f7fa3c9bae2618f",
      "seatRow": "A",
      "seatNumber": 10
    }
  ]
}
```

### Response:

```json
{
  "message": "Successfully reserved 3 seat(s)",
  "reservationCode": "RSV-XXXXXX",
  "reservedTicketId": "671b9700d34b23f0a4b9e503",
  "seatCount": 3
}
```

### Lưu ý:

- **1 ReservedTicket document** được tạo với mảng `seats` chứa 3 ghế
- Tất cả ghế được lưu trong cùng 1 document với cùng `userId`
- `seatStates` trong show được cập nhật = "held" cho tất cả ghế
- Redis lock được xóa sau khi tạo reservedTicket
- Socket.IO event `seat:held` được emit cho từng ghế

### Kiểm tra trong MongoDB:

```javascript
// Query reservedTicket
db.reservedTickets.findOne({
  reservationCode: "RSV-XXXXXX"
})

// Kết quả sẽ có:
{
  "_id": ObjectId("..."),
  "userId": ObjectId("671b9600d34b23f0a4b9e502"),
  "showId": ObjectId("671b9500d34b23f0a4b9e402"),
  "seats": [
    { "seatId": ObjectId("69384cf75f7fa3c9bae26188"), "seatRow": "A", "seatNumber": 3 },
    { "seatId": ObjectId("69384cf75f7fa3c9bae2618c"), "seatRow": "A", "seatNumber": 7 },
    { "seatId": ObjectId("69384cf75f7fa3c9bae2618f"), "seatRow": "A", "seatNumber": 10 }
  ],
  "reservationCode": "RSV-XXXXXX",
  "status": "reserved",
  "reservedUntil": ISODate("2025-03-01T17:30:00.000Z")
}
```

---

## 💳 Bước 5: Thanh toán nhiều ghế ngay (Pay Now Multiple) - Cần auth

### Request:

```
POST http://localhost:3000/booking/pay-now-multiple
Content-Type: application/json
Cookie: access_token={{access_token}}
```

### Body (Thanh toán 2 ghế):

```json
{
  "showId": "671b9500d34b23f0a4b9e402",
  "seats": [
    {
      "seatId": "69384cf75f7fa3c9bae26188",
      "seatRow": "A",
      "seatNumber": 3
    },
    {
      "seatId": "69384cf75f7fa3c9bae2618c",
      "seatRow": "A",
      "seatNumber": 7
    }
  ],
  "paymentMethod": "credit_card",
  "voucherCode": "MOVIE5K"
}
```

### Response:

```json
{
  "message": "Payment successful for 2 seat(s)",
  "ticketIds": ["671b9800d34b23f0a4b9e504", "671b9800d34b23f0a4b9e505"],
  "paymentId": "671b9800d34b23f0a4b9e506",
  "qrCodes": ["CGV1234567890ABC", "CGV1234567890DEF"],
  "amount": 250000,
  "breakdown": [
    {
      "type": "BASE",
      "label": "Giá gốc (2 ghế)",
      "amount": 200000
    },
    {
      "type": "SURCHARGE",
      "label": "Màn hình IMAX",
      "amount": 60000
    },
    {
      "type": "DISCOUNT",
      "label": "Voucher MOVIE5K",
      "amount": -5000
    },
    {
      "type": "TAX",
      "label": "VAT 8%",
      "amount": 20400
    },
    {
      "type": "ROUNDING",
      "label": "Làm tròn",
      "amount": -400
    }
  ]
}
```

### Lưu ý:

- **1 Payment record** được tạo cho tất cả ghế
- **Nhiều Ticket records** được tạo (1 ticket cho mỗi ghế)
- `seatStates` trong show được cập nhật = "sold" cho tất cả ghế
- Redis lock được xóa sau khi thanh toán
- Socket.IO event `seat:sold` được emit cho từng ghế

### Kiểm tra trong MongoDB:

```javascript
// Query payment
db.payments.findOne({
  _id: ObjectId('671b9800d34b23f0a4b9e506'),
});

// Query tickets
db.tickets.find({
  paymentId: ObjectId('671b9800d34b23f0a4b9e506'),
});

// Kết quả sẽ có 2 tickets cùng paymentId
```

---

## 🔄 Flow Test Hoàn Chỉnh

### Test Case 1: Reserve Multiple Seats

1. ✅ Login → Lấy token
2. ✅ GET `/booking/shows/:showId/seats-view` → Xem sơ đồ ghế
3. ✅ POST `/booking/selecting` (3 lần) → Chọn 3 ghế khác nhau
4. ✅ POST `/booking/reserve-multiple` → Đặt trước 3 ghế
5. ✅ Kiểm tra MongoDB: 1 reservedTicket với mảng seats có 3 phần tử
6. ✅ GET `/booking/shows/:showId/seats-view` → Xem ghế đã chuyển sang "held"

### Test Case 2: Pay Now Multiple Seats

1. ✅ Login → Lấy token
2. ✅ POST `/booking/selecting` (2 lần) → Chọn 2 ghế khác nhau
3. ✅ POST `/booking/pay-now-multiple` → Thanh toán 2 ghế
4. ✅ Kiểm tra MongoDB:
   - 1 payment record
   - 2 ticket records (cùng paymentId)
5. ✅ GET `/booking/shows/:showId/seats-view` → Xem ghế đã chuyển sang "sold"

### Test Case 3: Cancel Selecting

1. ✅ POST `/booking/selecting` → Chọn 1 ghế
2. ✅ POST `/booking/cancel-selecting` → Bỏ chọn ghế
3. ✅ Kiểm tra: Redis lock đã bị xóa, ghế quay về "available"

---

## ⚠️ Lưu ý quan trọng

1. **Redis Lock TTL**: 60 giây (1 phút)
   - Nếu không thanh toán trong 1 phút, ghế sẽ tự động unlock
   - Phải chọn ghế lại trước khi thanh toán

2. **Reserved Until**: 30 phút trước khi show bắt đầu
   - Nếu quá thời gian này, reservedTicket sẽ tự động expire
   - Cron job chạy mỗi phút để hủy các reservations hết hạn

3. **Seat States**:
   - `available`: Ghế trống, có thể chọn
   - `selecting`: Đang được chọn (Redis lock)
   - `held`: Đã đặt trước (có reservedTicket)
   - `sold`: Đã bán (có ticket)

4. **Socket.IO Events**:
   - `seat:selecting`: Khi user chọn ghế
   - `seat:available`: Khi user bỏ chọn hoặc reservation hết hạn
   - `seat:held`: Khi tạo reservedTicket
   - `seat:sold`: Khi thanh toán thành công

---

## 🐛 Debug Tips

### Kiểm tra Redis Lock:

```bash
# Kết nối Redis
redis-cli

# Xem tất cả keys
KEYS seat:selecting:*

# Xem value của 1 key
GET seat:selecting:671b9500d34b23f0a4b9e402:A-3

# Xem TTL còn lại
TTL seat:selecting:671b9500d34b23f0a4b9e402:A-3
```

### Kiểm tra MongoDB:

```javascript
// Xem reservedTickets
db.reservedTickets.find({ userId: ObjectId('671b9600d34b23f0a4b9e502') });

// Xem payments
db.payments.find({ userId: ObjectId('671b9600d34b23f0a4b9e502') });

// Xem tickets
db.tickets.find({ userId: ObjectId('671b9600d34b23f0a4b9e502') });

// Xem show seatStates
db.shows.findOne({ _id: ObjectId('671b9500d34b23f0a4b9e402') });
```

---

## 📞 Support

Nếu gặp lỗi, kiểm tra:

1. Server đang chạy: `npm run start:dev`
2. MongoDB connection: Kiểm tra `.env` file
3. Redis connection: Kiểm tra `REDIS_URL` trong `.env`
4. JWT token: Đảm bảo token còn hợp lệ (chưa hết hạn)
