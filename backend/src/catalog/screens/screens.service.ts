// ScreensService - CRUD phòng chiếu
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Screen, ScreenDocument } from '../../booking/schemas/screen.schema';
import { CreateScreenDto } from './dto/create-screen.dto';
import { UpdateScreenDto } from './dto/update-screen.dto';

@Injectable()
export class ScreensService {
  constructor(
    @InjectModel(Screen.name)
    private readonly screenModel: Model<ScreenDocument>,
  ) {}

  // Tạo phòng chiếu
  async create(dto: CreateScreenDto) {
    const screen = new this.screenModel(dto);
    return screen.save();
  }

  // Danh sách phòng chiếu
  async findAll() {
    return this.screenModel.find().lean().exec();
  }

  // Chi tiết phòng chiếu
  async findOne(id: string) {
    const screen = await this.screenModel.findById(id).lean().exec();
    if (!screen) throw new NotFoundException('Screen not found');
    return screen;
  }

  // Cập nhật
  async update(id: string, dto: UpdateScreenDto) {
    const updated = await this.screenModel
      .findByIdAndUpdate(id, dto, { new: true })
      .lean()
      .exec();
    if (!updated) throw new NotFoundException('Screen not found');
    return updated;
  }

  // Xoá
  async remove(id: string) {
    const res = await this.screenModel.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('Screen not found');
    return { message: 'Deleted' };
  }
}
