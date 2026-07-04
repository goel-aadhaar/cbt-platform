import { Test, TestingModule } from '@nestjs/testing';

import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root (liveness)', () => {
    it('reports ok status', () => {
      const result = appController.getStatus();
      expect(result.status).toBe('ok');
      expect(result.service).toBe('drsk-cbt-api');
    });
  });
});
