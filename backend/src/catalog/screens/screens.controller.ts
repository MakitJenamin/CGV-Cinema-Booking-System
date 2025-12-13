// ScreensController - REST endpoints cho phòng chiếu
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ScreensService } from './screens.service';
import { CreateScreenDto } from './dto/create-screen.dto';
import { UpdateScreenDto } from './dto/update-screen.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Public } from '../../auth/decorators/public.decorator';

@Controller('screens')
export class ScreensController {
  constructor(private readonly screensService: ScreensService) {}

  // Tạo phòng chiếu - staff/admin
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('staff', 'admin')
  create(@Body() dto: CreateScreenDto) {
    return this.screensService.create(dto);
  }

  // Danh sách phòng chiếu - public
  @Get()
  @Public()
  findAll() {
    return this.screensService.findAll();
  }

  // Chi tiết phòng chiếu - public
  @Get(':id')
  @Public()
  findOne(@Param('id') id: string) {
    return this.screensService.findOne(id);
  }

  // Cập nhật - staff/admin
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('staff', 'admin')
  update(@Param('id') id: string, @Body() dto: UpdateScreenDto) {
    return this.screensService.update(id, dto);
  }

  // Xoá - staff/admin
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('staff', 'admin')
  remove(@Param('id') id: string) {
    return this.screensService.remove(id);
  }
}
