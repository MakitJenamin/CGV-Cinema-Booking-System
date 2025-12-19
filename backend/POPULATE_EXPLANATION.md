# Giải thích Populate trong Mongoose

## 1. Populate là gì?

**Populate** là tính năng của Mongoose giúp tự động thay thế `ObjectId` bằng document thực tế từ collection khác.

## 2. Cách hoạt động (Step by Step)

### **KHÔNG dùng populate (chỉ query thông thường):**

```typescript
// Query ticket
const ticket = await TicketModel.findById('ticket123').exec();

// Kết quả:
ticket.showId = ObjectId('507f1f77bcf86cd799439011') // Chỉ là ID, không phải object
ticket.showId.movieId // ❌ LỖI! Vì showId chỉ là ObjectId, không có property movieId

// Muốn lấy thông tin show, phải query thêm:
const show = await ShowModel.findById(ticket.showId).exec();
// show.movieId vẫn chỉ là ObjectId('...'), chưa phải Movie document

// Muốn lấy thông tin movie, phải query thêm nữa:
const movie = await MovieModel.findById(show.movieId).exec();
// Cuối cùng mới có movie.title
```

**Vấn đề:** Phải query nhiều lần, tốn thời gian và code dài dòng.

---

### **DÙNG populate (Mongoose tự động join):**

```typescript
// Query ticket với populate
const ticket = await TicketModel
  .findById('ticket123')
  .populate({
    path: 'showId',  // Populate field 'showId'
    populate: [
      { path: 'movieId' },  // Populate nested field 'movieId' trong show
      { path: 'screenId' }  // Populate nested field 'screenId' trong show
    ]
  })
  .exec();

// Kết quả SAU KHI POPULATE:
ticket.showId = {
  _id: ObjectId('507f1f77bcf86cd799439011'),
  startTime: Date('2025-01-20'),
  endTime: Date('2025-01-20'),
  movieId: {  // ✅ Đã được populate thành Movie document
    _id: ObjectId('...'),
    title: 'Avengers: Endgame',  // ✅ Có thể truy cập trực tiếp!
    duration: 181
  },
  screenId: {  // ✅ Đã được populate thành Screen document
    _id: ObjectId('...'),
    name: 'Screen 01',
    theaterId: ObjectId('...')
  }
}

// Bây giờ có thể truy cập:
ticket.showId.movieId.title  // ✅ "Avengers: Endgame"
ticket.showId.screenId.name  // ✅ "Screen 01"
```

**Lợi ích:** Chỉ cần 1 query, Mongoose tự động join các collection liên quan.

---

## 3. Mongoose làm gì bên trong?

Khi bạn gọi `.populate('showId')`, Mongoose:

1. **Bước 1:** Query Ticket document (như bình thường)
   ```javascript
   // Mongoose query: db.tickets.findOne({ _id: 'ticket123' })
   // Kết quả: { _id: '...', showId: ObjectId('show123'), ... }
   ```

2. **Bước 2:** Lấy tất cả `showId` từ kết quả
   ```javascript
   // Mongoose thấy: showId = ObjectId('show123')
   ```

3. **Bước 3:** Query Show collection với các ID vừa lấy
   ```javascript
   // Mongoose tự động query: db.shows.find({ _id: { $in: ['show123'] } })
   // Kết quả: [{ _id: 'show123', movieId: ObjectId('movie456'), ... }]
   ```

4. **Bước 4:** Thay thế `ObjectId` bằng document thực tế
   ```javascript
   // Trước: ticket.showId = ObjectId('show123')
   // Sau:   ticket.showId = { _id: 'show123', movieId: ObjectId('movie456'), ... }
   ```

5. **Bước 5:** Nếu có nested populate, lặp lại bước 2-4
   ```javascript
   // Nếu có populate('movieId') trong show:
   // Mongoose query: db.movies.find({ _id: { $in: ['movie456'] } })
   // Sau đó thay: show.movieId = { _id: 'movie456', title: '...', ... }
   ```

---

## 4. Ví dụ trong code của bạn:

```typescript
const ticketDocs = await this.ticketModel
  .find({ paymentId: payment._id })
  .populate({
    path: 'showId',  // ✅ Populate showId: ObjectId → Show document
    select: 'startTime endTime screenFormatCode',
    populate: [
      {
        path: 'movieId',  // ✅ Populate movieId trong show: ObjectId → Movie document
        select: 'title duration',
      },
      {
        path: 'screenId',  // ✅ Populate screenId trong show: ObjectId → Screen document
        select: 'name theaterId',
        populate: {
          path: 'theaterId',  // ✅ Populate theaterId trong screen: ObjectId → Theater document
          select: 'name',
        },
      },
    ],
  })
  .exec();

// SAU KHI POPULATE:
// ticket.showId = Show document (không phải ObjectId nữa!)
// ticket.showId.movieId = Movie document (không phải ObjectId nữa!)
// ticket.showId.screenId = Screen document (không phải ObjectId nữa!)
// ticket.showId.screenId.theaterId = Theater document (không phải ObjectId nữa!)

// Vì vậy có thể truy cập:
const show = ticket.showId;  // ✅ Là Show document, không phải ObjectId
const movie = show.movieId;  // ✅ Là Movie document, không phải ObjectId
const title = movie.title;   // ✅ "Avengers: Endgame"
```

---

## 5. So sánh Performance:

### **KHÔNG dùng populate (N+1 queries):**
```typescript
// Query 1: Lấy tickets
const tickets = await TicketModel.find({ paymentId }).exec();
// → 1 query

// Query 2-11: Lấy show cho từng ticket (10 tickets = 10 queries)
for (const ticket of tickets) {
  const show = await ShowModel.findById(ticket.showId).exec();
  // → 10 queries
  
  // Query 12-21: Lấy movie cho từng show
  const movie = await MovieModel.findById(show.movieId).exec();
  // → 10 queries
  
  // Query 22-31: Lấy screen cho từng show
  const screen = await ScreenModel.findById(show.screenId).exec();
  // → 10 queries
}
// Tổng: 1 + 10 + 10 + 10 = 31 queries! 😱
```

### **DÙNG populate (Chỉ 4 queries):**
```typescript
const tickets = await TicketModel
  .find({ paymentId })
  .populate({
    path: 'showId',
    populate: ['movieId', 'screenId']
  })
  .exec();

// Mongoose tự động:
// Query 1: db.tickets.find({ paymentId })
// Query 2: db.shows.find({ _id: { $in: [showIds] } })
// Query 3: db.movies.find({ _id: { $in: [movieIds] } })
// Query 4: db.screens.find({ _id: { $in: [screenIds] } })
// Tổng: 4 queries! ✅
```

---

## 6. Lưu ý quan trọng:

1. **Populate chỉ hoạt động khi field có `ref` trong schema:**
   ```typescript
   @Prop({ type: Types.ObjectId, ref: 'Show' })  // ✅ Có ref → có thể populate
   showId: Types.ObjectId;
   ```

2. **Populate KHÔNG phải JOIN SQL:**
   - SQL JOIN: 1 query duy nhất, database tự join
   - Mongoose Populate: Nhiều queries riêng biệt, Mongoose tự động gộp kết quả

3. **Populate có thể chậm nếu có quá nhiều documents:**
   - Nên dùng `select()` để chỉ lấy fields cần thiết
   - Nên dùng `lean()` nếu không cần modify documents

---

## Tóm lại:

**Populate = Mongoose tự động query và thay thế ObjectId bằng document thực tế**

- **Trước populate:** `ticket.showId = ObjectId('...')` (chỉ là ID)
- **Sau populate:** `ticket.showId = { _id: '...', startTime: Date, movieId: {...} }` (là document đầy đủ)

Vì vậy bạn có thể truy cập `show.movieId.title` mà không cần query thêm!

