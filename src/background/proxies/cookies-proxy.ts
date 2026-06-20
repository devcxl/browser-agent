import type { IBrowserAdapter } from '@/adapters/types';
import type {
  CookieDetails,
  CookieGetAllDetails,
  CookieSetDetails,
} from '@/shared/types';

export class CookiesProxy {
  constructor(private adapter: IBrowserAdapter) {}

  async get(params: CookieDetails) {
    return this.adapter.cookies.get(params);
  }

  async getAll(params: CookieGetAllDetails) {
    return this.adapter.cookies.getAll(params);
  }

  async set(params: CookieSetDetails) {
    return this.adapter.cookies.set(params);
  }

  async remove(params: CookieDetails) {
    return this.adapter.cookies.remove(params);
  }

  async getAllCookieStores() {
    return this.adapter.cookies.getAllCookieStores();
  }
}
