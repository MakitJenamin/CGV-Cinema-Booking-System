// ShowsService - CRUD suất chiếu
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Show, ShowDocument } from '../../booking/schemas/show.schema';
import { CreateShowDto } from './dto/create-show.dto';
import { UpdateShowDto } from './dto/update-show.dto';

@Injectable()
export class ShowsService {
  constructor(
    @InjectModel(Show.name) private readonly showModel: Model<ShowDocument>,
  ) {}

  // Tạo show mới
  async create(dto: CreateShowDto) {
    const show = new this.showModel({
      ...dto,
      startTime: new Date(dto.startTime),
      endTime: new Date(dto.endTime),
      seatStates: new Map(), // Khởi tạo map trống
    });
    return show.save();
  }

  // Danh sách show
  async findAll() {
    return this.showModel.find().lean().exec();
  }

  // Chi tiết show
  async findOne(id: string) {
    const show = await this.showModel.findById(id).lean().exec();
    if (!show) throw new NotFoundException('Show not found');
    return show;
  }

  // Cập nhật show
  async update(id: string, dto: UpdateShowDto) {
    const payload: any = { ...dto };
    if (dto.startTime) payload.startTime = new Date(dto.startTime);
    if (dto.endTime) payload.endTime = new Date(dto.endTime);

    const updated = await this.showModel
      .findByIdAndUpdate(id, payload, { new: true })
      .lean()
      .exec();
    if (!updated) throw new NotFoundException('Show not found');
    return updated;
  }

  // Xoá show
  async remove(id: string) {
    const res = await this.showModel.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('Show not found');
    return { message: 'Deleted' };
  }
}
