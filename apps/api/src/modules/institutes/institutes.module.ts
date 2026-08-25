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
  // MyInstituteController MUST be registered before InstitutesController.
  // Both end up with a route shaped `institutes/<one segment>` — the
  // literal `institutes/me` here, and `@Get(':id')`/`@Patch(':id')` on the
  // superadmin controller. Express matches same-shape routes in
  // registration order, not by literal-vs-param specificity, so with the
  // superadmin controller first, `GET /institutes/me` was matching
  // `GET /institutes/:id` with id="me" and refusing every ADMIN/TEACHER/
  // STUDENT caller with "needs the SUPERADMIN role" — the self-service
  // route was never reachable at all.
  controllers: [MyInstituteController, InstitutesController],
  providers: [InstitutesService, InstituteUsageService],
})
export class InstitutesModule {}
