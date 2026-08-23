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
import { MediaKind } from '../../generated/prisma/enums';
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
    @Body('kind') kind?: string,
  ) {
    if (!file) {
      throw new BadRequestException('A file is required (form field "file")');
    }
    // Anything but an explicit DOCUMENT is an image: the question picker is by
    // far the busier caller and predates this, so it keeps sending nothing.
    return this.media.upload(
      file,
      altText,
      kind === 'DOCUMENT' ? MediaKind.DOCUMENT : MediaKind.IMAGE,
    );
  }

  /**
   * Stream a stored image. Only used when the storage backend has no direct
   * URL (local disk); with S3/CDN the browser fetches the CDN instead.
   *
   * Widened to STUDENT (the class-level gate is ADMIN/TEACHER only) — a
   * candidate needs to load a diagram attached to a question during an exam
   * or practice session. Tenant isolation still comes from `MediaService.read()`
   * scoping the lookup to the caller's institute, not from this role check.
   */
  @Get('file/:key')
  @Roles(Role.ADMIN, Role.TEACHER, Role.STUDENT)
  async file(@Param('key') key: string): Promise<StreamableFile> {
    const row = await this.media.read(decodeURIComponent(key));
    return new StreamableFile(row.body, {
      type: row.mimeType,
      /**
       * A diagram is shown in place; a document is meant to be kept.
       *
       * `inline` on a PDF opens the browser's viewer, which is fine, but on a
       * .docx or .xlsx it makes the browser download it under an opaque name
       * — the key's UUID — because nothing tells it otherwise. `attachment`
       * carries the original filename through.
       */
      disposition:
        row.kind === MediaKind.DOCUMENT
          ? `attachment; filename="${row.fileName.replace(/"/g, '')}"`
          : `inline; filename="${row.fileName.replace(/"/g, '')}"`,
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
