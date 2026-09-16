import { Module } from '@nestjs/common';
import { StoreService } from './config/store.service';
import { ProxiesService } from './config/proxies.service';
import { KeysService } from './config/keys.service';
import { SearchEngineService } from './engine/search-engine.service';
import { StatsService } from './stats/stats.service';
import { SearchController } from './controllers/search.controller';
import { ProvidersController } from './controllers/providers.controller';
import { ProxiesController } from './controllers/proxies.controller';
import { HealthController } from './controllers/health.controller';
import { KeysController } from './controllers/keys.controller';
import { ExternalController } from './controllers/external.controller';
import { McpController } from './controllers/mcp.controller';
import { StatsController } from './controllers/stats.controller';
import { McpService } from './mcp/mcp.service';

@Module({
  imports: [],
  controllers: [
    SearchController,
    ProvidersController,
    ProxiesController,
    HealthController,
    KeysController,
    ExternalController,
    McpController,
    StatsController,
  ],
  providers: [
    StoreService,
    ProxiesService,
    KeysService,
    SearchEngineService,
    StatsService,
    McpService,
  ],
})
export class AppModule {}