// SeatsController - REST endpoints cho ghế
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SeatsService } from './seats.service';
import { CreateSeatDto } from './dto/create-seat.dto';
import { UpdateSeatDto } from './dto/update-seat.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Public } from '../../auth/decorators/public.decorator';

@Controller('seats')
export class SeatsController {
  constructor(private readonly seatsService: SeatsService) {}

  // Tạo ghế - staff/admin
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('staff', 'admin')
  create(@Body() dto: CreateSeatDto) {
    return this.seatsService.create(dto);
  }

  // Danh sách ghế (có filter screenId) - public
  @Get()
  @Public()
  findAll(@Query('screenId') screenId?: string) {
    return this.seatsService.findAll(screenId);
  }

  // Chi tiết ghế - public
  @Get(':id')
  @Public()
  findOne(@Param('id') id: string) {
    return this.seatsService.findOne(id);
  }

  // Cập nhật ghế - staff/admin
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('staff', 'admin')
  update(@Param('id') id: string, @Body() dto: UpdateSeatDto) {
    return this.seatsService.update(id, dto);
  }

  // Xoá ghế - staff/admin
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('staff', 'admin')
  remove(@Param('id') id: string) {
    return this.seatsService.remove(id);
  }
}
