// ScreensModule - gom controller/service cho phòng chiếu
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScreensService } from './screens.service';
import { ScreensController } from './screens.controller';
import { Screen, ScreenSchema } from '../../booking/schemas/screen.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Screen.name, schema: ScreenSchema }]),
  ],
  controllers: [ScreensController],
  providers: [ScreensService],
  exports: [ScreensService],
})
export class ScreensModule {}
