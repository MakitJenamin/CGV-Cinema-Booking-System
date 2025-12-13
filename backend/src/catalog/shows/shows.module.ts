// ShowsModule - gom controller/service cho suất chiếu
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ShowsService } from './shows.service';
import { ShowsController } from './shows.controller';
import { Show, ShowSchema } from '../../booking/schemas/show.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Show.name, schema: ShowSchema }]),
  ],
  controllers: [ShowsController],
  providers: [ShowsService],
  exports: [ShowsService],
})
export class ShowsModule {}
