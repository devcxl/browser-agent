import type { IToolRegistry, IJsonRpcClient } from '@/shared/types';
import { createBookmarksTools } from './bookmarks';
import { createHistoryTools } from './history';
import { createDownloadsTools } from './downloads';
import { createCookiesTools } from './cookies';
import { createSessionsTools } from './sessions';
import { createMiscTools } from './misc';
import { createExpertTools } from './expert';

export function registerPhase2Tools(registry: IToolRegistry, rpc: IJsonRpcClient): void {
  registry.registerAll(createBookmarksTools(rpc));
  registry.registerAll(createHistoryTools(rpc));
  registry.registerAll(createDownloadsTools(rpc));
  registry.registerAll(createCookiesTools(rpc));
  registry.registerAll(createSessionsTools(rpc));
  registry.registerAll(createMiscTools(rpc));
  registry.registerAll(createExpertTools(rpc));
}
