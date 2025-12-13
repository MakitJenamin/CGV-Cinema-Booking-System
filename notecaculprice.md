Dưới đây là flow tính toán giá trước và sau khi thanh toán, dựa trên các collection đã seed:

## Flow tính toán giá (Pricing Flow)

### Phần 1: Trước khi thanh toán (Quote/Pricing Calculation)

#### Bước 1: User chọn ghế và yêu cầu tính giá

- User đã chọn ghế (có Redis lock)
- Frontend gọi `POST /booking/pay-now` hoặc `GET /pricing/quote` với:
  ```json
  {
    "showId": "...",
    "seatId": "...",
    "seatRow": "A",
    "seatNumber": 1,
    "voucherCode": "MOVIE5K", // optional
    "membershipTier": "diamond" // từ user profile
  }
  ```

#### Bước 2: Backend thu thập dữ liệu cần thiết

1. Lấy `show` → `movieId`, `screenId`, `screenFormatCode`, `startTime`
2. Lấy `movie` → `basePrice` (ví dụ: 120,000 VND)
3. Lấy `seat` → `seatTypeCode` (ví dụ: "vip")
4. Lấy `screen` → `screenFormatCode`, `theaterId`
5. Lấy `theater` → `theaterCode` (nếu cần)

#### Bước 3: Tính toán theo pipeline (Pha 1 → Pha 2)

**Pha 1: Cộng surcharges (tăng giá)**

```
1. Base Price = movie.basePrice = 120,000 VND

2. Seat Type Surcharge:
   - Tra seatTypeSurcharges theo seatTypeCode = "vip"
   - → +20,000 VND
   - Subtotal: 140,000 VND

3. Screen Format Surcharge:
   - Tra screenSurcharges theo screenFormatCode = "IMAX"
   - → +30,000 VND
   - Subtotal: 170,000 VND

4. Theater Surcharge:
   - Tra theaterSurcharges theo theaterId + screenFormat + dayOfWeek + timeRange
   - Ví dụ: Landmark +10,000 VND (áp dụng IMAX, all days)
   - Subtotal: 180,000 VND

5. Time Slot Surcharge:
   - Tra timeSlotSurcharges theo dayType (weekend/weekday/holiday) + timeRange
   - Ví dụ: Weekend 18:00-23:59 → +10,000 VND
   - Subtotal: 190,000 VND

→ Subtotal Pha 1 = 190,000 VND
```

**Pha 2: Trừ discounts (giảm giá)**

```
6. Membership Discount:
   - Tra membershipTiers theo membership = "diamond"
   - → baseDiscountPct = 15%
   - → Discount = 190,000 × 15% = 28,500 VND
   - → Max discount cap = 50,000 VND (từ note.md)
   - → Áp dụng: min(28,500, 50,000) = 28,500 VND
   - Subtotal: 190,000 - 28,500 = 161,500 VND

7. Promotion (Auto-apply):
   - Tra promotionsV2 theo:
     - applicableDays (sat/sun) ✓
     - applicableScreenFormats (IMAX) ✓
     - applicableSeatTypes (vip) ✓
     - timeRanges ✓
     - autoApply = true ✓
   - → WEEKEND15: -15%, maxDiscount = 20,000 VND
   - → Discount = min(161,500 × 15%, 20,000) = 20,000 VND
   - Subtotal: 161,500 - 20,000 = 141,500 VND

8. Voucher (nếu có):
   - Tra vouchers theo voucherCode = "MOVIE5K"
   - Kiểm tra: expiresAt, perUserLimit, globalLimit, channels
   - → MOVIE5K: -5,000 VND (fixed)
   - Subtotal: 141,500 - 5,000 = 136,500 VND

→ Subtotal Pha 2 = 136,500 VND
```

**Pha 3: Cộng fees & tax**

9. Tax (VAT):
   - Tra taxRules: VAT 8% (applyAfterDiscounts = true)
   - → Tax base = 138,500 VND
   - → Tax = 138,500 × 8% = 11,080 VND
   - Subtotal: 138,500 + 11,080 = 149,580 VND

→ Subtotal Pha 3 = 149,580 VND

```

**Pha 4: Rounding**

```

10. Rounding:
    - Tra roundingRules: mode = "nearest", step = 1,000
    - → 149,580 → làm tròn → 150,000 VND
    - → Delta = +420 VND

→ Grand Total = 150,000 VND

````

#### Bước 4: Tạo Price Quote (tùy chọn)

- Lưu vào `priceQuotes` với:
  - `quoteId`: "Q-20251031-000777"
  - `breakdown`: chi tiết từng bước
  - `expiresAt`: 5-10 phút sau (TTL)
  - `price`: 150,000 VND

#### Bước 5: Trả về cho Frontend

```json
{
  "quoteId": "Q-20251031-000777",
  "basePrice": 120000,
  "breakdown": [
    { "type": "BASE", "label": "Giá gốc", "amount": 120000 },
    { "type": "SURCHARGE", "label": "Ghế VIP", "amount": 20000 },
    { "type": "SURCHARGE", "label": "IMAX", "amount": 30000 },
    { "type": "SURCHARGE", "label": "Rạp Landmark", "amount": 10000 },
    { "type": "SURCHARGE", "label": "Cuối tuần tối", "amount": 10000 },
    {
      "type": "DISCOUNT",
      "label": "Thành viên Diamond -15%",
      "amount": -28500
    },
    { "type": "DISCOUNT", "label": "Khuyến mãi WEEKEND15", "amount": -20000 },
    { "type": "DISCOUNT", "label": "Voucher MOVIE5K", "amount": -5000 },
    { "type": "FEE", "label": "Phí dịch vụ", "amount": 2000 },
    { "type": "TAX", "label": "VAT 8%", "amount": 11080 },
    { "type": "ROUNDING", "label": "Làm tròn", "amount": 420 }
  ],
  "subtotal": 190000,
  "totalDiscount": 53500,
  "totalFees": 2000,
  "totalTax": 11080,
  "grandTotal": 150000,
  "expiresAt": "2025-10-31T15:05:00Z"
}
````

---

### Phần 2: Sau khi thanh toán (Payment Processing)

#### Bước 1: User xác nhận thanh toán

- Frontend gọi `POST /booking/pay-now` với:
  ```json
  {
    "showId": "...",
    "seatId": "...",
    "seatRow": "A",
    "seatNumber": 1,
    "paymentMethod": "credit_card",
    "voucherCode": "MOVIE5K", // optional
    "quoteId": "Q-20251031-000777" // optional, để validate giá
  }
  ```

#### Bước 2: Backend validate và tính lại giá

1. Kiểm tra Redis lock (phải là user hiện tại)
2. Validate quote (nếu có `quoteId`):
   - Lấy `priceQuote` từ DB
   - Kiểm tra `expiresAt` > now
   - Kiểm tra `userId` match
   - Kiểm tra `showId`, `seatId` match
3. Tính lại giá (theo pipeline trên) để đảm bảo không thay đổi
4. So sánh với `quoteId` (nếu có) → phải match

#### Bước 3: Tạo Payment Record

```javascript
// Tạo payment trong MongoDB
const payment = {
  userId: ObjectId("..."),
  amount: 150000,
  currency: "VND",
  provider: "vnpay", // hoặc từ paymentMethod
  paymentMethod: "credit_card",
  status: "pending", // → sẽ update thành "success" sau khi gateway confirm
  transactionId: "VNP20251025190000123",
  discountBreakdown: [
    { type: "MEMBERSHIP", tier: "diamond", amount: 28500 },
    { type: "PROMO", code: "WEEKEND15", amount: 20000 },
    { type: "VOUCHER", code: "MOVIE5K", amount: 5000 },
  ],
  fees: [{ name: "Convenience Fee", amount: 2000 }],
  tax: { name: "VAT 8%", amount: 11080 },
  roundedDelta: 420,
  createdAt: new Date(),
};
```

#### Bước 4: Tạo Ticket Record

```javascript
// Tạo ticket trong MongoDB
const ticket = {
  paymentId: payment._id,
  userId: ObjectId("..."),
  showId: ObjectId("..."),
  seatId: ObjectId("..."),
  seatRow: "A",
  seatNumber: 1,
  qrCode: "CGV202510251234567", // generate unique QR
  status: "active",
  checkedInAt: null,
  issuedAt: new Date(),
};
```

#### Bước 5: Cập nhật Show.seatStates

```javascript
// Update show.seatStates
show.seatStates.set("A-1", {
  status: "sold",
  ticketId: ticket._id,
  reservedTicketId: null,
  updatedAt: new Date(),
});
await show.save();
```

#### Bước 6: Xóa Redis lock

```javascript
await redisClient.del(`seat:selecting:${showId}:A-1`);
```

#### Bước 7: Emit Socket.IO event

```javascript
seatSelectionGateway.emitSeatSold(showId, "A-1");
```

#### Bước 8: Tạo Pricing Audit (log chi tiết)

```javascript
// Lưu vào pricingAudits để audit/debug
const audit = {
  quoteId: "Q-20251031-000777",
  userId: ObjectId("..."),
  showId: ObjectId("..."),
  seats: [{ seatId: ObjectId("..."), type: "vip" }],
  pipeline: [
    {
      step: "movieBase",
      amount: 120000,
      meta: { movieId: "...", title: "Avatar 3" },
    },
    { step: "seatType", amount: 20000, meta: { seatTypeCode: "vip" } },
    { step: "screen", amount: 30000, meta: { screenFormatCode: "IMAX" } },
    { step: "theater", amount: 10000, meta: { theaterId: "..." } },
    { step: "timeSlot", amount: 10000, meta: { dayType: "weekend" } },
    { step: "membership", amount: -28500, meta: { tier: "diamond", pct: 15 } },
    { step: "promo", amount: -20000, meta: { code: "WEEKEND15" } },
    { step: "voucher", amount: -5000, meta: { code: "MOVIE5K" } },
    { step: "fees", amount: 2000, meta: { name: "Convenience Fee" } },
    { step: "tax", amount: 11080, meta: { ratePct: 8 } },
    { step: "rounding", amount: 420, meta: { nearest: 1000 } },
  ],
  priceBefore: 120000,
  priceAfter: 150000,
  createdAt: new Date(),
};
```

#### Bước 9: Trả về kết quả cho Frontend

```json
{
  "success": true,
  "ticketId": "...",
  "paymentId": "...",
  "qrCode": "CGV202510251234567",
  "amount": 150000,
  "breakdown": [...],  // giống như quote
  "message": "Payment successful"
}
```

---

## Lưu ý quan trọng

1. Show đã bắt đầu: vẫn cho phép mua (bỏ check `show.startTime` trong `payNow`)
2. Stacking Matrix: kiểm tra `stackingMatrix` để đảm bảo voucher + promo + membership có thể stack
3. Price Floor: kiểm tra `globalPriceFloorPct = 50%` → không được giảm quá 50% giá gốc
4. Quote Expiry: `priceQuotes` có TTL 5-10 phút để tránh giá cũ
5. Audit Trail: `pricingAudits` lưu lại toàn bộ pipeline để debug/audit

Bạn muốn mình implement flow này vào `BookingService.payNow()` không?
