// SeatsService - CRUD ghế
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Seat, SeatDocument } from '../../booking/schemas/seat.schema';
import { CreateSeatDto } from './dto/create-seat.dto';
import { UpdateSeatDto } from './dto/update-seat.dto';

@Injectable()
export class SeatsService {
  constructor(
    @InjectModel(Seat.name) private readonly seatModel: Model<SeatDocument>,
  ) {}

  // Tạo ghế
  async create(dto: CreateSeatDto) {
    const seat = new this.seatModel(dto);
    return seat.save();
  }

  // Danh sách ghế (có thể filter theo screenId)
  async findAll(screenId?: string) {
    const filter = screenId ? { screenId } : {};
    return this.seatModel.find(filter).lean().exec();
  }

  // Chi tiết ghế
  async findOne(id: string) {
    const seat = await this.seatModel.findById(id).lean().exec();
    if (!seat) throw new NotFoundException('Seat not found');
    return seat;
  }

  // Cập nhật ghế
  async update(id: string, dto: UpdateSeatDto) {
    const updated = await this.seatModel
      .findByIdAndUpdate(id, dto, { new: true })
      .lean()
      .exec();
    if (!updated) throw new NotFoundException('Seat not found');
    return updated;
  }

  // Xoá ghế
  async remove(id: string) {
    const res = await this.seatModel.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('Seat not found');
    return { message: 'Deleted' };
  }
}
