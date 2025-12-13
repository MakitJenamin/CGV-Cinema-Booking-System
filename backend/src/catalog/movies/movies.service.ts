// MoviesService - CRUD đơn giản cho phim
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Movie, MovieDocument } from '../../booking/schemas/movie.schema';
import { CreateMovieDto } from './dto/create-movie.dto';
import { UpdateMovieDto } from './dto/update-movie.dto';

@Injectable()
export class MoviesService {
  constructor(
    @InjectModel(Movie.name) private readonly movieModel: Model<MovieDocument>,
  ) {}

  // Tạo phim mới
  async create(dto: CreateMovieDto) {
    const movie = new this.movieModel(dto);
    return movie.save();
  }

  // Lấy danh sách phim (công khai)
  async findAll() {
    return this.movieModel.find().lean().exec();
  }

  // Lấy chi tiết phim
  async findOne(id: string) {
    const movie = await this.movieModel.findById(id).lean().exec();
    if (!movie) throw new NotFoundException('Movie not found');
    return movie;
  }

  // Cập nhật phim
  async update(id: string, dto: UpdateMovieDto) {
    const updated = await this.movieModel
      .findByIdAndUpdate(id, dto, { new: true })
      .lean()
      .exec();
    if (!updated) throw new NotFoundException('Movie not found');
    return updated;
  }

  // Xoá phim
  async remove(id: string) {
    const res = await this.movieModel.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('Movie not found');
    return { message: 'Deleted' };
  }
}
