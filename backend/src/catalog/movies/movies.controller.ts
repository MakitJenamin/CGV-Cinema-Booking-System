// MoviesController - REST endpoints cho phim
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
import { MoviesService } from './movies.service';
import { CreateMovieDto } from './dto/create-movie.dto';
import { UpdateMovieDto } from './dto/update-movie.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Public } from '../../auth/decorators/public.decorator';

@Controller('movies')
export class MoviesController {
  constructor(private readonly moviesService: MoviesService) {}

  // Tạo phim mới - chỉ staff/admin
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('staff', 'admin')
  create(@Body() dto: CreateMovieDto) {
    return this.moviesService.create(dto);
  }

  // Danh sách phim - public
  @Get()
  @Public()
  findAll() {
    return this.moviesService.findAll();
  }

  // Chi tiết phim - public
  @Get(':id')
  @Public()
  findOne(@Param('id') id: string) {
    return this.moviesService.findOne(id);
  }

  // Cập nhật phim - staff/admin
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('staff', 'admin')
  update(@Param('id') id: string, @Body() dto: UpdateMovieDto) {
    return this.moviesService.update(id, dto);
  }

  // Xoá phim - staff/admin
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('staff', 'admin')
  remove(@Param('id') id: string) {
    return this.moviesService.remove(id);
  }
}
