import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { InstituteUsageService } from './institute-usage.service';
import { InstitutesController } from './institutes.controller';
import { MyInstituteController } from './institutes-my.controller';
import { InstitutesService } from './institutes.service';

@Module({
  // AuthModule is the import that lets `MyInstituteController` reach the
  // `@CurrentUser()` decorator and the JWT guard that backs it. Without
  // it, the route would resolve but the parameter would always be null.
  // MediaModule is for MediaStoragePort — resolving a logo key to a URL
  // (§ institute branding).
  imports: [AuthModule, MediaModule],
  controllers: [InstitutesController, MyInstituteController],
  providers: [InstitutesService, InstituteUsageService],
})
export class InstitutesModule {}
