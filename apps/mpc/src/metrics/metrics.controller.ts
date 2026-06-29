import { Controller, Get, Res } from '@nestjs/common';
import { registry } from './index';

@Controller()
export class MetricsController {
  @Get('metrics')
  async getMetrics(@Res({ passthrough: true }) res: any) {
    res.set('Content-Type', registry.contentType);
    return registry.metrics();
  }
}
