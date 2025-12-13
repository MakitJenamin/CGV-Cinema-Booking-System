```ts
// ===================== MOVIE MANAGEMENT =====================
movies
{
  "_id": ObjectId("671b91f9d34b23f0a4b9e111"),
  "title": "Avatar 3",
  "titleEn": "Avatar 3",
  "duration": 180,
  "genre": ["Action", "Sci-Fi", "Adventure"],
  "director": "James Cameron",
  "cast": ["Sam Worthington", "Zoe Saldana"],
  "description": "Khám phá Pandora...",
  "posterUrl": "/images/avatar3.jpg",
  "trailerUrl": "https://youtube.com/...",
  "releaseDate": ISODate("2025-12-20T00:00:00Z"),
  "rating": "PG-13",                  // P | C13 | T18...
  "basePrice": 120000,                // GIÁ GỐC DUY NHẤT CỦA PHIM
  "validFromTo": {                    // Cửa sổ được phép chiếu
    "from": ISODate("2025-12-20T00:00:00Z"),
    "to":   ISODate("2026-03-31T23:59:59Z")   // hoặc null nếu không giới hạn
  },
  "isActive": true,
  "createdAt": ISODate("2025-01-01T00:00:00Z")
}

theaters
{
  "_id": ObjectId("671b9400d34b23f0a4b9e301"),
  "name": "CGV Landmark 81",
  "address": "208 Nguyễn Hữu Cảnh, Quận 1, TP.HCM",
  "city": "Ho Chi Minh City",
  "location": { "lat": 10.7938, "lng": 106.7227 },
  "phone": "1900-6017",
  "isActive": true
}

screenFormats
{
  "_id": ObjectId("6730a002aaab000000000003"),
  "code": "IMAX",                     // unique: 2D | 3D | IMAX | 4DX | SCREENX
  "name": "IMAX",
  "nameEn": "IMAX",
  "description": "Màn hình IMAX công nghệ cao",
  "attributes": { "aspectRatio": "1.43:1", "resolution": "4K" },
  "ui": { "color": "#FF6B00", "icon": "imax", "legendOrder": 3 },
  "isActive": true
}

screens
{
  "_id": ObjectId("671b9410d34b23f0a4b9e302"),
  "theaterId": ObjectId("671b9400d34b23f0a4b9e301"),
  "name": "Cinema 1",
  "capacity": 200,
  "screenFormatId": ObjectId("6730a002aaab000000000003"), // <-- tham chiếu screenFormats
  "screenFormatCode": "IMAX",                              // (tuỳ chọn, để FE đọc nhanh & filter mà không join)
  // sẽ có số lượng các seat ở đây :
}

seats
{
  "_id": ObjectId("671b9420d34b23f0a4b9e303"),
  "screenId": ObjectId("671b9410d34b23f0a4b9e302"),
  "row": "A",
  "number": 1,
  "seatTypeId": ObjectId("6730a001aaab000000000002"), // <-- tham chiếu seatTypes
  // (tuỳ chọn, để FE đọc nhanh & sort legend mà không join)
  "seatTypeCode": "vip",                      // standard | premium | vip | couple | handicap
  "isActive": true
}

seatTypes
{
  "_id": ObjectId("6730a001aaab000000000002"),
  "code": "vip",                         // unique: standard | premium | vip | couple |
  "name": "Ghế VIP",
  "attributes": { "extraWidthMm": 50, },
  "ui": { "color": "#A500FF", "icon": "crown", "legendOrder": 2 },
  "isActive": true
}

// ===================== SHOWTIME MANAGEMENT =====================
shows
{
  "_id": ObjectId("671b9500d34b23f0a4b9e401"),
  "movieId": ObjectId("671b91f9d34b23f0a4b9e111"),
  "screenId": ObjectId("671b9410d34b23f0a4b9e302"),
  "screenFormatId": ObjectId("6730a002aaab000000000003"), // <-- tham chiếu screenFormats
  "screenFormatCode": "IMAX",
  "seatStates": {
    "A-1": {
      status: "sold",                 // available | held | sold | blocked
      ticketId: "671b9900d34b23f0a4b9e801", // khi sold
      reservedTicketId: null,
      tick
      updatedAt: ISODate("2025-10-25T19:32:00Z")
    },
    "C-2": {
      status: "held",
      ticketId: null,
      reservedTicketId: "671b9900d34b23f0a4b9e801",
      updatedAt: ISODate("2025-10-25T19:28:00Z")
    }
  }                //
  "startTime": ISODate("2025-10-26T19:30:00Z"),
  "endTime":   ISODate("2025-10-26T22:30:00Z"),
  "isActive": true
}

// ===================== USER MANAGEMENT =====================
users
{
  "_id": ObjectId("671b9600d34b23f0a4b9e501"),
  "name": "Nguyen Van A",
  "email": "user@example.com",
  "phone": "+84912345678",
  "password": "hashed_password",
  "dateOfBirth": ISODate("1995-05-15T00:00:00Z"),
  "gender": "male",                   // male | female | other
  "membership": "diamond",            // regular | gold | diamond
  "points": 1250,
  "roles": ["user"],
  "isActive": true,
  "createdAt": ISODate("2024-01-01T00:00:00Z"),
  "lastLoginAt": ISODate("2025-10-25T18:00:00Z")
}

// ===================== BOOKING & PAYMENT =====================
reservedTickets
{
  "_id": ObjectId("671b9900d34b23f0a4b9e7F1"),
  "userId": ObjectId("671b9600d34b23f0a4b9e501"),
  "showId": ObjectId("671b9500d34b23f0a4b9e401"),
  "seatId": ObjectId("671b9420d34b23f0a4b9e303"),
  "seatRow": "A",
  "seatNumber": 1,
  "reservationCode": "RSV-8F3K9Q",
  "reservedUntil": ISODate("2025-10-26T19:00:00Z"),
  "status": "reserved",                // reserved | expired | cancelled
  "channel": "online",
  "createdAt": ISODate("2025-10-25T19:32:00Z")
}

payments
{
  "_id": ObjectId("671b9800d34b23f0a4b9e701"),
  "userId": ObjectId("671b9600d34b23f0a4b9e501"),
  "promoCode": "WELCOME10",            // nếu có
  "amount": 162000,
  "currency": "VND",
  "provider": "vnpay",                 // vnpay | momo | zalopay | credit_card
  "paymentMethod": "qr",               // qr | card | wallet
  "status": "success",                 // pending | success | failed | refunded
  "transactionId": "VNP20251025190000123",
  "paidAt": ISODate("2025-10-25T19:32:00Z"),
  "discountBreakdown": [
    { "type":"MEMBERSHIP","tier":"diamond","amount":18000 },
    { "type":"PROMO","code":"WEEKEND15","amount":12000 },
    { "type":"VOUCHER","code":"MOVIE5K","amount":5000 }
  ],
  "fees": [{ "name":"Convenience Fee","amount":2000 }],
  "tax": { "name":"VAT 8%","amount":12880 },
  "roundedDelta": 120
}

tickets
{
  "_id": ObjectId("671b9900d34b23f0a4b9e801"),
  "paymentId": ObjectId("671b9800d34b23f0a4b9e701"),
  "userId": ObjectId("671b9600d34b23f0a4b9e501"),
  "showId": ObjectId("671b9500d34b23f0a4b9e401"),
  "seatId": ObjectId("671b9420d34b23f0a4b9e303"),
  "seatRow": "A",
  "seatNumber": 1,
  "qrCode": "CGV202510251234567",
  "status": "active",                  // active | used | refunded
  "checkedInAt": null,
  "issuedAt": ISODate("2025-10-25T19:32:00Z")
}

// ===================== PRICING: SURCHARGES (RẠP/PHÒNG/GHẾ/GIỜ) =====================
theaterSurcharges
{
  "_id": ObjectId("67210a20d34b23f0a4c0f002"),
  "theaterId": ObjectId("671b9400d34b23f0a4b9e301"),
  "mode": "amount",                   // amount | percent
  "value": 10000,                     // +10k tại Landmark
  "applicableScreenFormats": ["2D","IMAX"], // []/null = mọi screenFormat
  "dayOfWeek": ["mon","tue","wed","thu","fri","sat","sun"],
  "timeRanges": [ { "from": "00:00", "to": "23:59" } ],
  "isActive": true
}

screenSurcharges
{
  "_id": ObjectId("67210a30d34b23f0a4c0f003"),
  "screenId": ObjectId("671b9410d34b23f0a4b9e302"),
  "screenFormatId": ObjectId("6730a002aaab000000000003"), // <-- tham chiếu screenFormats
  "screenFormatCode": "IMAX",                              // (tuỳ chọn, để filter nhanh)
  "mode": "amount",
  "value": 30000,                     // IMAX room +30k
  "isActive": true
}

seatTypeSurcharges
{
  "_id": ObjectId("67210a40d34b23f0a4c0f004"),
  "scope": "global",                  // global | screen
  "screenId": null,
  "seatTypeId": ObjectId("6730a001aaab000000000002"),
  "seatTypeCode": "vip",
  "mode": "amount",
  "value": 20000,                     // ghế VIP +20k
  "isActive": true
}

timeSlotSurcharges
{
  "_id": ObjectId("67210a50d34b23f0a4c0f005"),
  "dayType": "weekend",               // weekday | weekend | holiday
  "timeRanges": [ { "from": "18:00", "to": "23:59" } ],
  "mode": "amount",
  "value": 10000,                     // tối cuối tuần +10k
  "isActive": true
}

// ===================== MEMBERSHIP =====================
membershipTiers
{
  "_id": ObjectId("67210a70d34b23f0a4c0f007"),
  "membership": "diamond",            // regular | gold | diamond
  "baseDiscountPct": 15,              // áp ở Pha 2
  "priceFloorPct": 70,                // không dưới 70% sau Pha 1
  "eligibleDays": ["mon","tue","wed","thu","fri","sat","sun"],
  "excludeScreenFormats": ["4DX"],
  "specialRules": [
    { "name": "Birthday", "mode": "percent", "value": 10, "capAmount": 20000 }
  ],
  "pointsEarnRate": 5,
  "perks": { "freeTicketPerMonth": 1, "freeSnackPerPurchase": true },
  "isActive": true
}

// ===================== PROMOTIONS & VOUCHERS =====================
promotionsV2
{
  "_id": ObjectId("67210a80d34b23f0a4c0f008"),
  "code": "WEEKEND15",
  "name": "Cuối tuần -15% (cap 20k)",
  "type": "percent",                  // percent | fixed | bogo | bundle
  "value": 15,
  "maxDiscount": 20000,
  "minPurchase": 0,
  "autoApply": true,                  // tự áp ở Pha 2
  "priority": 80,
  "stackingGroup": "PCT",
  "budget": { "total": 500000000, "used": 125000000 }, // VND
  "applicableMovies": [],            // [] = all
  "applicableSeatTypes": ["standard","vip"],
  "applicableScreenFormats": ["IMAX","2D"],
  "applicableDays": ["sat","sun"],
  "timeRanges": [ { "from": "00:00", "to": "23:59" } ],
  "channels": ["APP","WEB"],         // APP | WEB | POS
  "paymentMethods": [],
  "perUserLimit": 3,
  "globalLimit": 100000,
  "startAt": ISODate("2025-01-01T00:00:00Z"),
  "endAt": ISODate("2025-12-31T23:59:59Z"),
  "isActive": true
}

vouchers
{
  "_id": ObjectId("67210a90d34b23f0a4b9e009"),
  "code": "MOVIE5K",
  "promoId": ObjectId("67210a80d34b23f0a4b9e008"),
  "issuedToUserId": null,             // null = public
  "isSingleUse": false,
  "perUserLimit": 5,
  "globalLimit": 200000,
  "channels": ["APP","WEB"],
  "expiresAt": ISODate("2025-12-31T23:59:59Z"),
  "signature": "sha256:...",
  "isActive": true
}

stackingMatrix
{
  "_id": ObjectId("67210aa0d34b23f0a4c0f00a"),
  "rules": [
    { "group": "PCT", "canStackWith": { "PCT": false, "AMT": true,  "PAY": true,  "VCH": false } },
    { "group": "AMT", "canStackWith": { "PCT": true,  "AMT": false, "PAY": true,  "VCH": true  } },
    { "group": "PAY", "canStackWith": { "PCT": true,  "AMT": true,  "PAY": false, "VCH": true  } },
    { "group": "VCH", "canStackWith": { "PCT": false, "AMT": true,  "PAY": true,  "VCH": false } }
  ],
  "globalPriceFloorPct": 50
}

promoBudgetHolds
{
  "_id": ObjectId("67210ab0d34b23f0a4c0f00b"),
  "holdKey": "QUOTE:ST671b9500:U671b9600",
  "promoId": ObjectId("67210a80d34b23f0a4b9e008"),
  "amountReserved": 12000,            // số tiền giảm tạm giữ
  "expiresAt": ISODate("2025-10-31T15:05:00Z"),
  "status": "held"                    // held | released | consumed
}

// ===================== FEES / TAX / ROUNDING =====================
feeRules
{
  "_id": ObjectId("67210ac0d34b23f0a4c0f00c"),
  "name": "Convenience Fee",
  "applyScope": "ticket",             // ticket | order
  "mode": "amount",                   // amount | percent
  "value": 2000,
  "channels": ["APP","WEB"],
  "paymentMethods": [],
  "isActive": true
}

taxRules
{
  "_id": ObjectId("67210ad0d34b23f0a4c0f00d"),
  "name": "VAT 8%",
  "jurisdiction": "VN",
  "ratePct": 8,
  "applyAfterDiscounts": true,
  "isActive": true
}

roundingRules
{
  "_id": ObjectId("67210ae0d34b23f0a4c0f00e"),
  "currency": "VND",
  "mode": "nearest",                  // up | down | nearest
  "step": 1000
}

// ===================== AUDIT & QUOTES =====================
pricingAudits       // ghi ở Pha 2 (đầy đủ pipeline)
{
  "_id": ObjectId("67210af0d34b23f0a4c0f00f"),
  "quoteId": "Q-20251031-000777",
  "userId": ObjectId("671b9600d34b23f0a4b9e501"),
  "showId": ObjectId("671b9500d34b23f0a4b9e401"),
  "seats": [{ "seatId": ObjectId("671b9420d34b23f0a4b9e303"), "type": "vip" }],
  "pipeline": [
    { "step": "movieBase",  "amount": 120000, "meta": { "movieId":"...", "title":"Avatar 3" } },
    { "step": "theater",    "amount": +10000, "meta": { "theaterId":"..." } },
    { "step": "screen",     "amount": +30000, "meta": { "screenId":"..." } },
    { "step": "seatType",   "amount": +20000, "meta": { "seatTypeId":"..." } },
    { "step": "timeSlot",   "amount": +10000, "meta": { "dayType":"weekend" } },
    { "step": "membership", "amount": -18000, "meta": { "tier":"diamond", "pct":15 } },
    { "step": "promo",      "amount": -12000, "meta": { "code":"WEEKEND15" } },
    { "step": "voucher",    "amount": -5000,  "meta": { "code":"MOVIE5K" } },
    { "step": "fees",       "amount": +2000,  "meta": { "name":"Convenience Fee" } },
    { "step": "tax",        "amount": +12880, "meta": { "ratePct":8 } },
    { "step": "rounding",   "amount": +120,   "meta": { "nearest":1000 } }
  ],
  "priceBefore": 120000,
  "priceAfter": 162000,
  "createdAt": ISODate("2025-10-31T08:35:00Z")
}

priceQuotes         // snapshot giá Pha 2 để thanh toán (TTL 5–10 phút)
{
  "_id": ObjectId("67210b00d34b23f0a4c0f010"),
  "quoteId": "Q-20251031-000777",
  "mode": "full",                      // phân biệt với cache nội bộ Pha 1 nếu bạn muốn
  "userId": ObjectId("671b9600d34b23f0a4b9e501"),
  "showId": ObjectId("671b9500d34b23f0a4b9e401"),
  "seats": ["671b9420d34b23f0a4b9e303"],
  "price": 162000,
  "breakdown": [
    { "type":"MEMBERSHIP","amount":18000,"note":"Diamond -15%" },
    { "type":"PROMO","code":"WEEKEND15","amount":12000 },
    { "type":"VOUCHER","code":"MOVIE5K","amount":5000 }
  ],
  "expiresAt": ISODate("2025-10-31T15:05:00Z"),
  "createdAt": ISODate("2025-10-31T15:00:00Z")
}

// ===================== SNACKS & CONCESSION =====================
snacks
{
  "_id": ObjectId("671b9200d34b23f0a4b9e903"),
  "name": "Bắp rang bơ lớn",
  "nameEn": "Large Popcorn",
  "description": "Bắp rang bơ thơm ngon",
  "category": "popcorn",              // popcorn | drink | combo | other
  "price": 85000,
  "imageUrl": "/images/large-popcorn.jpg",
  "isActive": true
}

snackOrders
{
  "_id": ObjectId("671b9300d34b23f0a4b9e904"),
  "userId": ObjectId("671b9600d34b23f0a4b9e501"),
  "showId": ObjectId("671b9500d34b23f0a4b9e401"),
  "items": [
    { "snackId": ObjectId("671b9200d34b23f0a4b9e903"), "quantity": 2, "price": 85000 }
  ],
  "total": 170000,
  "deliveryTime": ISODate("2025-10-26T19:00:00Z"),
  "status": "pending",                // pending | confirmed | delivered | cancelled
  "createdAt": ISODate("2025-10-25T20:00:00Z")
}

// ===================== REFUNDS & NOTIFICATIONS =====================
refunds
{
  "_id": ObjectId("671b9400d34b23f0a4b9e905"),
  "ticketId": ObjectId("671b9900d34b23f0a4b9e801"),
  "userId": ObjectId("671b9600d34b23f0a4b9e501"),
  "reason": "emergency",              // emergency | cancellation | complaint
  "requestedAt": ISODate("2025-10-26T08:00:00Z"),
  "processedAt": ISODate("2025-10-26T08:30:00Z"),
  "refundAmount": 81000,
  "status": "completed"               // pending | approved | rejected | completed
}

notifications
{
  "_id": ObjectId("671b9500d34b23f0a4b9e906"),
  "userId": ObjectId("671b9600d34b23f0a4b9e501"),
  "type": "ticket_confirmed",         // ticket_confirmed | payment_success | promo_alert | movie_released
  "title": "Đặt vé thành công",
  "message": "Vé của bạn cho Avatar 3 đã được xác nhận",
  "read": false,
  "createdAt": ISODate("2025-10-25T19:32:00Z")
}

// 8. ADMIN ROLES & PERMISSIONS (nếu cần phân quyền chi tiết)
roles
{
  "_id": ObjectId("67210b70d34b23f0a4c0f017"),
  "code": "admin",                    // admin | manager | staff | user
  "name": "Administrator",
  "permissions": [
    "movies.create",
    "movies.update",
    "movies.delete",
    "shows.create",
    "payments.view",
    "users.manage"
  ],
  "isActive": true
}


```
