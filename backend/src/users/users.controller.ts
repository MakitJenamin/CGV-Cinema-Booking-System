// UsersController xử lý HTTP requests liên quan đến User
// Controller nhận request từ client → gọi Service → trả về response

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users') // base path cho tất cả routes trong controller này = "/users"
export class UsersController {
  // Inject UsersService vào controller (Dependency Injection)
  constructor(private readonly usersService: UsersService) {}

  /**
   * POST /users
   * Tạo user mới
   * @param createUserDto - Dữ liệu từ body request (JSON)
   * @returns User document đã tạo (không có password)
   */
  @Post()
  @HttpCode(HttpStatus.CREATED) // Trả về status code 201 (Created) thay vì 200
  async create(@Body() createUserDto: CreateUserDto) {
    // @Body() decorator tự động parse JSON body thành CreateUserDto
    // ValidationPipe (đã cấu hình trong main.ts) sẽ validate createUserDto
    // Nếu không hợp lệ → tự động trả về HTTP 400 Bad Request
    return this.usersService.create(createUserDto);
  }

  /**
   * GET /users?page=1&limit=10
   * Lấy danh sách users (có phân trang)
   * @param page - Số trang (query parameter, mặc định = 1)
   * @param limit - Số lượng mỗi trang (query parameter, mặc định = 10)
   * @returns Object chứa danh sách users + thông tin phân trang
   */
  @Get()
  async findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    // @Query() lấy query parameter từ URL
    // VD: GET /users?page=2&limit=20 → page = "2", limit = "20"
    // parseInt() convert string → number (nếu không có thì dùng giá trị mặc định)
    return this.usersService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  /**
   * GET /users/:id
   * Lấy thông tin 1 user theo ID
   * @param id - MongoDB ObjectId (lấy từ URL path)
   * @returns User document
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    // @Param('id') lấy giá trị từ path parameter
    // VD: GET /users/671b9600d34b23f0a4b9e501 → id = "671b9600d34b23f0a4b9e501"
    return this.usersService.findOne(id);
  }

  /**
   * PATCH /users/:id
   * Cập nhật thông tin user
   * @param id - MongoDB ObjectId
   * @param updateUserDto - Dữ liệu cần update (chỉ cần gửi các field muốn đổi)
   * @returns User document đã cập nhật
   */
  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  /**
   * DELETE /users/:id
   * Xóa user (soft delete - set isActive = false)
   * @param id - MongoDB ObjectId
   * @returns User document đã bị đánh dấu inactive
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT) // Trả về 204 No Content (thành công nhưng không có body)
  async remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
