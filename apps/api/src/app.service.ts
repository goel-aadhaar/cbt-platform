import { Injectable } from '@nestjs/common';

export interface AppStatus {
  status: 'ok';
  service: string;
  timestamp: string;
}

@Injectable()
export class AppService {
  getStatus(): AppStatus {
    return {
      status: 'ok',
      service: 'drsk-cbt-api',
      timestamp: new Date().toISOString(),
    };
  }
}
