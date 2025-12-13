// ShowsController - REST endpoints cho suất chiếu
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
import { ShowsService } from './shows.service';
import { CreateShowDto } from './dto/create-show.dto';
import { UpdateShowDto } from './dto/update-show.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Public } from '../../auth/decorators/public.decorator';

@Controller('shows')
export class ShowsController {
  constructor(private readonly showsService: ShowsService) {}

  // Tạo show - staff/admin
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('staff', 'admin')
  create(@Body() dto: CreateShowDto) {
    return this.showsService.create(dto);
  }

  // Danh sách show - public
  @Get()
  @Public()
  findAll() {
    return this.showsService.findAll();
  }

  // Chi tiết show - public
  @Get(':id')
  @Public()
  findOne(@Param('id') id: string) {
    return this.showsService.findOne(id);
  }

  // Cập nhật show - staff/admin
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('staff', 'admin')
  update(@Param('id') id: string, @Body() dto: UpdateShowDto) {
    return this.showsService.update(id, dto);
  }

  // Xoá show - staff/admin
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('staff', 'admin')
  remove(@Param('id') id: string) {
    return this.showsService.remove(id);
  }
}
