// UsersService chứa logic nghiệp vụ (business logic) cho User
// Service này được inject vào Controller để xử lý request

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable() // decorator này cho Nest biết đây là service có thể inject vào nơi khác
export class UsersService {
  // InjectModel là cách Nest inject Mongoose model vào service
  // 'User' là tên model (phải match với tên trong UsersModule.forFeature)
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  /**
   * Tạo user mới
   * @param createUserDto - DTO chứa thông tin user cần tạo
   * @returns User document đã lưu vào MongoDB
   */
  async create(createUserDto: CreateUserDto): Promise<UserDocument> {
    // Hash password bằng bcrypt (salt rounds = 10)
    // bcrypt.hash() tạo ra chuỗi hash không thể reverse về password gốc
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    // Tạo user mới với password đã hash
    const newUser = new this.userModel({
      ...createUserDto,
      password: hashedPassword,
    });

    // .save() lưu vào MongoDB và trả về document đã lưu
    return newUser.save();
  }

  /**
   * Tìm tất cả users (có phân trang)
   * @param page - số trang (bắt đầu từ 1)
   * @param limit - số lượng user mỗi trang
   * @returns Object chứa danh sách users và thông tin phân trang
   */
  async findAll(page = 1, limit = 10) {
    const skip = (page - 1) * limit; // bỏ qua bao nhiêu document

    // .find() tìm tất cả, .skip() bỏ qua, .limit() giới hạn số lượng
    // .select('-password') = loại bỏ field password khỏi kết quả (bảo mật)
    const users = await this.userModel
      .find()
      .select('-password')
      .skip(skip)
      .limit(limit)
      .exec();

    // Đếm tổng số user (để tính tổng số trang)
    const total = await this.userModel.countDocuments().exec();

    return {
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Tìm user theo ID
   * @param id - MongoDB ObjectId của user
   * @returns User document (không có password)
   */
  async findOne(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).select('-password').exec();

    // Nếu không tìm thấy, throw NotFoundException (Nest tự convert thành HTTP 404)
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  /**
   * Tìm user theo email (dùng cho login)
   * @param email - Email của user
   * @param includePassword - true = trả về cả password (cần cho login), false = không trả về
   * @returns User document
   */
  async findByEmail(
    email: string,
    includePassword = false,
  ): Promise<UserDocument | null> {
    // Nếu cần password (khi login), dùng .select('+password') để override select: false
    const query = this.userModel.findOne({ email });
    if (includePassword) {
      query.select('+password');
    }
    return query.exec();
  }

  /**
   * Cập nhật thông tin user
   * @param id - MongoDB ObjectId
   * @param updateUserDto - DTO chứa các field cần update
   * @returns User document đã cập nhật
   */
  async update(
    id: string,
    updateUserDto: UpdateUserDto,
  ): Promise<UserDocument> {
    // .findByIdAndUpdate() tìm và update trong 1 lần
    // { new: true } = trả về document SAU KHI update (mặc định trả về document cũ)
    // .select('-password') = không trả về password
    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, updateUserDto, { new: true })
      .select('-password')
      .exec();

    if (!updatedUser) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return updatedUser;
  }

  /**
   * Xóa user (soft delete - chỉ đánh dấu isActive = false)
   * @param id - MongoDB ObjectId
   * @returns User document đã được đánh dấu inactive
   */
  async remove(id: string): Promise<UserDocument> {
    // Thay vì xóa hẳn, ta chỉ set isActive = false (soft delete)
    const user = await this.userModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .select('-password')
      .exec();

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  /**
   * Cập nhật thời gian đăng nhập cuối cùng
   * @param userId - MongoDB ObjectId
   */
  async updateLastLogin(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      lastLoginAt: new Date(),
    });
  }
}
