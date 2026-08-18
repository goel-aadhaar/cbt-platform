import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { MediaService } from './media.service';

/**
 * Media module (§2.7). Staff upload question images/diagrams; the database
 * keeps only the storage key. Serving goes through the CDN when one is
 * configured, otherwise the API streams the bytes.
 */
@ApiTags('media')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.TEACHER)
@Controller({ path: 'media', version: '1' })
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  list() {
    return this.media.list();
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('altText') altText?: string,
  ) {
    if (!file) {
      throw new BadRequestException('An image is required (form field "file")');
    }
    return this.media.upload(file, altText);
  }

  /**
   * Stream a stored image. Only used when the storage backend has no direct
   * URL (local disk); with S3/CDN the browser fetches the CDN instead.
   */
  @Get('file/:key')
  async file(@Param('key') key: string): Promise<StreamableFile> {
    const row = await this.media.read(decodeURIComponent(key));
    return new StreamableFile(row.body, {
      type: row.mimeType,
      disposition: `inline; filename="${row.fileName}"`,
    });
  }

  @Delete(':id')
  @ApiQuery({ name: 'confirm', required: false, type: Boolean })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('confirm') confirm?: string,
  ) {
    return this.media.remove(id, confirm === 'true');
  }
}
