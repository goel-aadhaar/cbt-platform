import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module';
import { LocalMediaAdapter } from './adapters/local-media.adapter';
import { S3MediaAdapter } from './adapters/s3-media.adapter';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { MediaStoragePort } from './ports/media-storage.port';

/**
 * Media (§2.7) behind the port pattern from §2.6.
 *
 * S3 is selected the moment a bucket is configured; until then the local
 * adapter keeps the feature usable. Infrastructure is the client's
 * responsibility (§4/§14), so the platform cannot require credentials to boot.
 */
@Module({
  imports: [AuthModule], // for TenantContextService
  controllers: [MediaController],
  providers: [
    MediaService,
    S3MediaAdapter,
    LocalMediaAdapter,
    {
      provide: MediaStoragePort,
      inject: [ConfigService, S3MediaAdapter, LocalMediaAdapter],
      useFactory: (
        config: ConfigService,
        s3: S3MediaAdapter,
        local: LocalMediaAdapter,
      ) => (config.get<string>('AWS_S3_BUCKET') ? s3 : local),
    },
  ],
  exports: [MediaStoragePort], // attempts/practice resolve keys to URLs
})
export class MediaModule {}
