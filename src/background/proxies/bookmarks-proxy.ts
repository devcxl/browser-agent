import type { IBrowserAdapter } from '@/adapters/types';
import type {
  BookmarkSearchQuery,
  BookmarkCreateArg,
  BookmarkChangesArg,
} from '@/shared/types';

export class BookmarksProxy {
  constructor(private adapter: IBrowserAdapter) {}

  async search(params: { query: string } | BookmarkSearchQuery) {
    return this.adapter.bookmarks.search(params as string | BookmarkSearchQuery);
  }

  async create(params: BookmarkCreateArg) {
    return this.adapter.bookmarks.create(params);
  }

  async update(params: { id: string; changes: BookmarkChangesArg }) {
    return this.adapter.bookmarks.update(params.id, params.changes);
  }

  async get(params: { id: string }) {
    return this.adapter.bookmarks.get(params.id);
  }

  async move(params: { id: string; destination: { parentId?: string; index?: number } }) {
    return this.adapter.bookmarks.move(params.id, params.destination);
  }

  async remove(params: { id: string }) {
    await this.adapter.bookmarks.remove(params.id);
    return { success: true };
  }

  async getTree() {
    return this.adapter.bookmarks.getTree();
  }
}
