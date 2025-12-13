---
name: Backend Kickoff Plan (Tiếng Việt)
overview: ""
todos:
  - id: 2b3c131a-089c-4a41-b8b1-835518e7e50c
    content: Init backend repo & Nest scaffold
    status: pending
  - id: 805ca993-1da9-4a9c-aa90-f14843b5c271
    content: Install deps + env config + Mongo/Redis
    status: pending
  - id: e62234cc-213c-40b4-98c2-896dd247258e
    content: Implement users/auth modules with RBAC
    status: pending
  - id: 010e1f10-b41c-4a2a-af29-063cdd0a3eb8
    content: CRUD modules for movies/theaters/screens
    status: pending
  - id: 19fd22c4-e521-49fc-8cf2-a80f6252fba4
    content: Pricing/booking schema scaffolds
    status: pending
  - id: 64c03949-fe47-4959-86d3-0bdbe8254758
    content: Swagger + logging + sample tests
    status: pending
---

# Backend Kickoff Plan (Tiếng Việt)

## 1. Repo & Scaffolding

- Tạo repo riêng cho backend NestJS và scaffold bằng `nest new backend` (TypeScript + ESLint có sẵn).
- Thêm Prettier + Husky + lint-staged để format và lint trước khi commit.

## 2. Core Dependencies & Config

- Cài các thư viện: `@nestjs/config`, `@nestjs/mongoose`, `mongoose`, `bcrypt`, `passport`, `@nestjs/passport`, `passport-jwt`, `class-transformer`, `class-validator`, `@nestjs/throttler`, `helmet`, `cookie-parser`, `ioredis`, `cache-manager-redis-store`, `decimal.js`, `@nestjs/websockets`, `socket.io`.
- Tạo `.env` (Mongo Atlas URI, Redis URL, JWT secret, cookie keys) và cấu hình ConfigModule + validation schema.
- Kết nối Mongo Atlas, cấu hình Redis cache module và global validation pipe.

## 3. Auth & User Module

- Xây `users` module (schema bám collection `users`, DTOs, service, controller).
- Xây `auth` module với JWT lưu trong cookie HTTP-only (login/logout), hashing mật khẩu bằng bcrypt, guard bảo vệ route.
- Tạo decorator + guard RBAC cho customer / staff / technician / admin.

## 4. Domain Modules (Phase 1)

- Tạo CRUD modules cho `movies`, `theaters`, `screen-formats`, `screens`, `seat-types`, `seats`, `shows`.
- Đảm bảo quan hệ ObjectId chính xác và hỗ trợ filter/pagination cơ bản.

## 5. Pricing & Booking Foundations

- Pricing module: CRUD cho surcharge, membership, promotions, vouchers, fees, tax, rounding, stacking.
- Booking module: schema & CRUD cho reservedTickets, tickets, payments, promoBudgetHolds, priceQuotes, pricingAudits.
- Service quản lý `seatStates` (Redis lock) chuẩn bị cho realtime với `@nestjs/websockets` + `socket.io`.

## 6. Observability & Docs

- Tích hợp `@nestjs/swagger` để có API docs; bảo vệ route phù hợp bằng guard.
- Dùng logger mặc định của Nest (sau có thể nâng cấp). Bỏ phần test cho giai đoạn học đầu tiên.
- Khi cần tra cứu snippet/cách dùng thư viện mới nhất, sử dụng Context7 (resolve-id + get-docs) để đọc document chính thức.

## 7. Frontend Ghi Nhớ (sẽ làm sau backend)

- NextJS + Tailwind + TanStack Query + axios + react-hook-form + Zod.
- Trạng thái cục bộ dùng `Zustand` tích hợp `zustand/middleware/persist` để lưu dữ liệu auth/giỏ chờ vào storage.
- Sử dụng Context7 để tra cứu doc mới nhất của NextJS/TanStack khi cần.