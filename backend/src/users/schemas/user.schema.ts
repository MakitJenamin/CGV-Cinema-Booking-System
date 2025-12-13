// User Schema định nghĩa cấu trúc document User trong MongoDB collection "users"
// Mongoose sẽ tự động tạo collection "users" nếu chưa có

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// UserDocument là type kết hợp giữa User class và Document của Mongoose
// Giúp TypeScript biết user có các method như .save(), .toJSON()...
export type UserDocument = User & Document;

// @Schema() decorator báo cho Mongoose biết đây là schema
@Schema({
  timestamps: true, // tự động thêm createdAt, updatedAt
  collection: 'users', // tên collection trong MongoDB (mặc định là "users" nếu không khai báo)
})
export class User {
  // @Prop() định nghĩa một field trong document
  // required: true = bắt buộc phải có khi tạo user mới
  @Prop({ required: true })
  name: string;

  // unique: true = không được trùng email (MongoDB tự tạo index)
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  phone: string;

  // select: false = khi query user, mặc định KHÔNG trả về password (bảo mật)
  // Chỉ khi nào bạn gọi .select('+password') thì mới lấy được
  @Prop({ required: true, select: false })
  password: string;

  @Prop({ type: Date })
  dateOfBirth?: Date;

  // enum: chỉ cho phép 3 giá trị này
  @Prop({ enum: ['male', 'female', 'other'] })
  gender?: 'male' | 'female' | 'other';

  // enum cho membership tier
  @Prop({ enum: ['regular', 'gold', 'diamond'], default: 'regular' })
  membership: 'regular' | 'gold' | 'diamond';

  @Prop({ default: 0 })
  points: number;

  // [String] = mảng các string (roles: ["user", "admin"]...)
  @Prop({ type: [String], default: ['user'] })
  roles: string[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Date })
  lastLoginAt?: Date;
}

// SchemaFactory.createForClass() tạo ra Mongoose schema từ class User
export const UserSchema = SchemaFactory.createForClass(User);
