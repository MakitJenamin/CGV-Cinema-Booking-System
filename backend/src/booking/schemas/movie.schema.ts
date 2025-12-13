// Movie Schema - thông tin phim cơ bản để hiển thị kèm suất chiếu
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MovieDocument = Movie & Document;

@Schema({ collection: 'movies', timestamps: false })
export class Movie {
  // Tên phim (tiếng Việt)
  @Prop({ required: true })
  title: string;

  // Tên phim tiếng Anh (nếu có)
  @Prop()
  titleEn?: string;

  // Thời lượng phim (phút)
  @Prop()
  duration?: number;

  // Giới hạn độ tuổi (PG-13, T18...)
  @Prop()
  rating?: string;

  // Poster để hiển thị
  @Prop()
  posterUrl?: string;

  // Giá gốc của phim (basePrice)
  @Prop()
  basePrice?: number;
}

export const MovieSchema = SchemaFactory.createForClass(Movie);
