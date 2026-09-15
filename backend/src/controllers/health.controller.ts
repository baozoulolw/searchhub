import { Controller, Get } from '@nestjs/common';

@Controller('api/health')
export class HealthController {
  @Get()
  check() {
    return {
      success: true,
      name: 'websearch-backend',
      time: new Date().toISOString(),
    };
  }
}