# Flow Chọn Ghế & Thanh Toán (Seat Selection & Payment Flow)

## 📋 Tổng Quan

Flow này mô tả cách xử lý việc chọn ghế (selecting) và thanh toán trong hệ thống đặt vé phim, sử dụng:

- **Redis**: Distributed lock với TTL = 1 phút để đảm bảo chỉ 1 user có thể chọn 1 ghế tại 1 thời điểm
- **Socket.IO**: Broadcast real-time trạng thái ghế cho tất cả clients
- **MongoDB**: Lưu trữ `reservedTickets`, `tickets`, và `show.seatStates`

---

## 🔄 Phần 1: Flow Chọn Ghế (Selecting) với Redis Lock (TTL = 1 phút)

### Bước 1: User A Click Ghế A-1

- **Frontend**: User A click ghế A-1 trên UI
- **Frontend**: Gửi Socket.IO event `seat:selecting` hoặc REST API `POST /booking/selecting` với payload:
  ```json
  {
    "showId": "show123",
    "seatId": "A-1"
  }
  ```

### Bước 2: Backend Xử Lý (User A)

- **Backend** nhận request từ User A
- **Backend** thực hiện Redis command:

  ```
  SET seat:selecting:showId:A-1 userA NX EX 60
  ```

  - `NX`: Chỉ set nếu key chưa tồn tại (atomic operation - đảm bảo không có race condition)
  - `EX 60`: TTL = 60 giây (1 phút)
  - **Nếu thành công** → Redis trả về `OK` → User A giữ lock
  - **Nếu thất bại** → Redis trả về `null` → Ghế đang được chọn bởi người khác

### Bước 3: Broadcast Trạng Thái "Selecting"

- **Nếu User A thành công**:
  - Backend emit Socket.IO event `seat:selecting` tới **TẤT CẢ clients**:
    ```json
    {
      "showId": "show123",
      "seatId": "A-1",
      "userId": "userA",
      "status": "selecting"
    }
    ```
  - **Tất cả clients** (kể cả User A) cập nhật UI: ghế A-1 hiển thị màu "selecting" (ví dụ: vàng)
  - User B, C, D... thấy ghế A-1 đang được chọn → **không thể click**

### Bước 4: User B Click Cùng Ghế A-1 (Cùng Lúc)

- **Frontend**: User B click ghế A-1
- **Backend** nhận request từ User B
- **Backend** thực hiện Redis command:

  ```
  SET seat:selecting:showId:A-1 userB NX EX 60
  ```

  - Redis trả về `null` (key đã tồn tại, User A đã giữ lock)
  - **Backend** trả về lỗi:
    ```json
    {
      "error": "Seat is being selected by another user"
    }
    ```
  - **Frontend User B**: Hiển thị thông báo "Ghế đang được chọn"

### Bước 5: User A Quyết Định

#### Trường hợp 5a: User A Click "Đặt Trước" (Reserve)

- **Frontend** gửi `POST /booking/reserve` với payload:
  ```json
  {
    "showId": "show123",
    "seatId": "A-1"
  }
  ```
- **Backend** xử lý:
  1. Kiểm tra Redis lock: `GET seat:selecting:showId:A-1` → phải là `userA`
  2. Nếu đúng → Tạo `reservedTicket` trong MongoDB với:
     - `userId`: userA
     - `showId`: show123
     - `seatId`: A-1
     - `reservedUntil`: `show.startTime - 30 phút`
     - `status`: "reserved"
  3. Cập nhật `show.seatStates["A-1"] = "held"` trong MongoDB
  4. **Xóa Redis lock**: `DEL seat:selecting:showId:A-1`
  5. Emit Socket.IO event `seat:held`:
     ```json
     {
       "showId": "show123",
       "seatId": "A-1",
       "status": "held"
     }
     ```
- **Tất cả clients** cập nhật: ghế A-1 chuyển sang màu "held" (ví dụ: xanh lá)

#### Trường hợp 5b: User A Click "Thanh Toán Ngay" (Pay-Now)

- **Frontend** gửi `POST /booking/pay-now` với payload:
  ```json
  {
    "showId": "show123",
    "seatId": "A-1",
    "paymentMethod": "credit_card"
  }
  ```
- **Backend** xử lý:
  1. Kiểm tra Redis lock: `GET seat:selecting:showId:A-1` → phải là `userA`
  2. Nếu đúng → Tính giá (basePrice + surcharges)
  3. Tạo `ticket` trong MongoDB (không qua `reservedTicket`)
  4. Cập nhật `show.seatStates["A-1"] = "sold"` trong MongoDB
  5. **Xóa Redis lock**: `DEL seat:selecting:showId:A-1`
  6. Emit Socket.IO event `seat:sold`:
     ```json
     {
       "showId": "show123",
       "seatId": "A-1",
       "status": "sold"
     }
     ```
- **Tất cả clients** cập nhật: ghế A-1 chuyển sang màu "sold" (ví dụ: đỏ)

#### Trường hợp 5c: User A Bỏ Chọn (Click Lại Ghế Hoặc Đóng Modal)

- **Frontend** gửi `POST /booking/cancel-selecting` hoặc tự động khi component unmount với payload:
  ```json
  {
    "showId": "show123",
    "seatId": "A-1"
  }
  ```
- **Backend** xử lý:
  1. Kiểm tra Redis lock: `GET seat:selecting:showId:A-1` → phải là `userA`
  2. Nếu đúng → **Xóa Redis lock**: `DEL seat:selecting:showId:A-1`
  3. Emit Socket.IO event `seat:available`:
     ```json
     {
       "showId": "show123",
       "seatId": "A-1",
       "status": "available"
     }
     ```
- **Tất cả clients** cập nhật: ghế A-1 quay về màu "available" (ví dụ: xám)

#### Trường hợp 5d: User A Không Làm Gì (Timeout 1 Phút)

- Redis tự động xóa key sau 60 giây (TTL hết hạn)
- **Backend** có thể:
  - Dùng Redis `EXPIRE` event hoặc cron job để detect và emit `seat:available`
  - Hoặc đơn giản: khi User khác thử chọn, Redis lock đã hết → có thể set lại

---

## 💳 Phần 2: Flow Thanh Toán

### Trường Hợp A: Thanh Toán Ngay (Pay-Now) - Không Qua ReservedTicket

1. **User chọn ghế** → Redis lock (1 phút)
2. **User click "Thanh toán ngay"**
3. **Backend** xử lý:
   - Kiểm tra Redis lock (phải là user hiện tại)
   - Tính giá (basePrice + surcharges)
   - Tạo `ticket` trong MongoDB
   - Cập nhật `show.seatStates[seatId] = "sold"` trong MongoDB
   - **Xóa Redis lock**
   - Emit Socket.IO `seat:sold`
4. **Frontend**: Hiển thị vé đã mua

### Trường Hợp B: Thanh Toán ReservedTicket (Đã Đặt Trước)

1. **User đã có `reservedTicket`** (đã qua bước "Đặt trước")
2. **User vào trang thanh toán**, nhập `reservationCode`
3. **Backend** xử lý:
   - Tìm `reservedTicket` theo `reservationCode`
   - Kiểm tra `reservedUntil` (phải > thời gian hiện tại)
   - Tính giá (basePrice + surcharges)
   - Tạo `ticket` từ `reservedTicket`
   - Xóa `reservedTicket`
   - Cập nhật `show.seatStates[seatId] = "sold"` trong MongoDB
   - Emit Socket.IO `seat:sold`
4. **Frontend**: Hiển thị vé đã thanh toán

---

## 📡 Socket.IO Events

| Event            | Khi Nào Emit                                                 | Payload                                           |
| ---------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| `seat:selecting` | User bắt đầu chọn ghế (Redis lock thành công)                | `{ showId, seatId, userId, status: "selecting" }` |
| `seat:available` | Ghế quay về trạng thái available (user bỏ chọn hoặc timeout) | `{ showId, seatId, status: "available" }`         |
| `seat:held`      | Ghế đã được đặt trước (reservedTicket tạo thành công)        | `{ showId, seatId, status: "held" }`              |
| `seat:sold`      | Ghế đã được bán (ticket tạo thành công)                      | `{ showId, seatId, status: "sold" }`              |

---

## ⚠️ Lưu Ý Quan Trọng

1. **Redis Lock TTL = 1 phút**: Đủ để user quyết định, không quá lâu để block người khác
2. **Atomic Operations**: `SET NX EX` đảm bảo chỉ 1 user giữ lock tại 1 thời điểm
3. **Socket.IO Broadcast**: Tất cả clients cập nhật UI real-time
4. **Fallback**: Nếu Redis down, có thể fallback về MongoDB (chậm hơn nhưng vẫn hoạt động)
5. **Cleanup**: Luôn xóa Redis lock sau khi reserve/pay/cancel

---

## 🔑 Redis Key Format

```
seat:selecting:{showId}:{seatId}
```

Ví dụ:

```
seat:selecting:show123:A-1
```

Value: `userId` (ví dụ: `userA`)

TTL: 60 giây (1 phút)

---

## 📝 Checklist Implementation

- [ ] Tạo endpoint `POST /booking/selecting` để set Redis lock
- [ ] Tạo endpoint `POST /booking/cancel-selecting` để xóa Redis lock
- [ ] Tạo endpoint `POST /booking/pay-now` để thanh toán ngay
- [ ] Tích hợp Socket.IO gateway để emit events
- [ ] Xử lý Redis lock trong `BookingService`
- [ ] Xử lý timeout (TTL hết hạn) và cleanup
- [ ] Frontend: Optimistic UI update khi click ghế
- [ ] Frontend: Socket.IO listener để cập nhật UI real-time

---

## 🎯 Tối Ưu UX

1. **Optimistic UI**: Khi user click ghế, đổi màu "selecting" ngay lập tức, đồng thời gửi request. Nếu backend trả về fail (ghế đã bị chọn), revert UI và báo lỗi.
2. **Socket.IO thay vì REST**: Dùng Socket.IO để gửi "selecting" thay vì REST API nặng → payload nhỏ, response nhanh.
3. **TTL ngắn**: 1 phút đủ để user quyết định, không quá lâu để block người khác.

---

**Cập nhật lần cuối**: [Ngày tạo file]
