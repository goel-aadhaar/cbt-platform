import { INestApplication, VersioningType } from '@nestjs/common';

/**
 * Route-shaping conventions that must exist in BOTH the live server (main.ts)
 * and e2e tests, so tests hit the exact same paths as production:
 *   - global prefix  → /api/...
 *   - URI versioning → /api/v1/...  (health & docs are VERSION_NEUTRAL → /api/...)
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
}
