/**
 * 数据导出/导入服务。
 *
 * - 会话级：Markdown（人类可读）或 JSON（含 toolCalls 完整结构）；
 * - 全量：JSON 快照（IndexedDB 三张表 + ConfigStore 配置），配套导入恢复；
 * - 导入策略：会话按 id upsert（同 id 覆盖），配置按键合并（快照里有才写），
 *   不删除现有数据 —— 导入是「补充/恢复」，不是「替换」。
 */
import type { Conversation, StoredMessage } from './types/conversation';
import type { ProviderConfig } from './types/llm';
import type { JevSettings } from './types/storage';
import type { BrowserAgentDB } from './db/schema';

type DbConversation = BrowserAgentDB['conversations']['value'];
type DbMessage = BrowserAgentDB['messages']['value'];
import { Database } from '@/shared/db/database';
import { ConfigStore } from '@/shared/storage';
import type { StorageSchema } from './types/storage';

/** 全量快照格式（v1） */
export interface FullSnapshot {
  format: 'browser-agent-snapshot';
  version: 1;
  exportedAt: number;
  /** IndexedDB conversations + messages（DB 行原样） */
  conversations: Array<DbConversation & { messages: DbMessage[] }>;
  /** ConfigStore 键值（providers / agentSettings / expertModeSettings / jevSettings / preferences / floatingButtonSettings / skills / skillSubscriptions） */
  settings: Record<string, unknown>;
}

/** 允许导入覆盖的配置键白名单（与导出侧一致） */
const IMPORTABLE_SETTINGS_KEYS: ReadonlySet<string> = new Set([
  'providers', 'agentSettings', 'expertModeSettings',
  'jevSettings', 'preferences', 'floatingButtonSettings',
  'skills', 'skillSubscriptions',
]);

/** 自定义 header 中属于凭据的名称 */
const SECRET_HEADER_PATTERN = /authorization|api[-_]?key|token|secret/i;

function redactProvider(provider: ProviderConfig): ProviderConfig {
  const redacted: ProviderConfig = { ...provider, apiKey: '' };
  if (provider.extraHeaders) {
    redacted.extraHeaders = Object.fromEntries(
      Object.entries(provider.extraHeaders).map(([name, value]) => [
        name,
        SECRET_HEADER_PATTERN.test(name) ? '' : value,
      ]),
    );
  }
  return redacted;
}

/**
 * 导出前剥离凭据：API Key 与鉴权类 header 一律置空。
 * 备份文件会落到磁盘或云盘，凭据不应随之离开浏览器。
 */
function redactSecrets(settings: Record<string, unknown>): Record<string, unknown> {
  const providers = settings.providers as ProviderConfig[] | undefined;
  const jevSettings = settings.jevSettings as JevSettings | undefined;
  return {
    ...settings,
    ...(Array.isArray(providers) ? { providers: providers.map(redactProvider) } : {}),
    ...(jevSettings ? { jevSettings: { ...jevSettings, apiKey: '' } } : {}),
  };
}

/** 合并 header：导入值为空（脱敏所致）时回填本机同名 header 的值 */
function mergeHeaders(
  imported: Record<string, string> | undefined,
  local: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!imported) return local;
  if (!local) return imported;
  const merged = { ...imported };
  for (const [name, value] of Object.entries(imported)) {
    if (value === '' && local[name]) merged[name] = local[name];
  }
  return merged;
}

/**
 * 备份不含凭据：导入时按 provider id 回填本机已有的 API Key 与鉴权 header，
 * 避免导入备份把已配置的密钥清空。本机同样没有的保持为空，由用户补填。
 */
async function restoreLocalSecrets(settings: Record<string, unknown>): Promise<void> {
  const store = ConfigStore.getInstance();
  const providers = settings.providers as ProviderConfig[] | undefined;
  if (Array.isArray(providers)) {
    const localById = new Map((await store.get('providers')).map((p) => [p.id, p]));
    settings.providers = providers.map((provider) => {
      const local = localById.get(provider.id);
      if (!local) return provider;
      return {
        ...provider,
        apiKey: provider.apiKey || local.apiKey,
        extraHeaders: mergeHeaders(provider.extraHeaders, local.extraHeaders),
      };
    });
  }
  const jevSettings = settings.jevSettings as JevSettings | undefined;
  if (jevSettings && !jevSettings.apiKey) {
    settings.jevSettings = { ...jevSettings, apiKey: (await store.get('jevSettings')).apiKey };
  }
}

/** 触发浏览器下载 */
function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 文件名安全化：保留中日文/字母数字，其余转 - */
function safeName(title: string): string {
  return title.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 60) || 'conversation';
}

function timestamp(): string {
  return new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
}

// ── 会话级导出 ──────────────────────────────────────────

/** 把一条会话渲染为 Markdown（含工具调用折叠块） */
export function renderConversationMarkdown(
  conversation: Conversation,
  messages: StoredMessage[],
): string {
  const lines: string[] = [
    `# ${conversation.title}`,
    '',
    `> 导出于 ${new Date().toLocaleString()} · ${messages.length} 条消息`,
  ];
  if (conversation.summary) {
    lines.push('', '## 摘要', '', conversation.summary);
  }
  for (const msg of messages) {
    lines.push('', '---', '');
    const time = new Date(msg.timestamp ?? 0).toLocaleString();
    if (msg.role === 'user') {
      lines.push(`**👤 用户** · ${time}`, '', msg.content);
    } else if (msg.role === 'assistant') {
      if (msg.toolCalls?.length) {
        for (const tc of msg.toolCalls) {
          lines.push(`**🛠 工具调用** \`${tc.name}\``, '', '```json', JSON.stringify(tc.params, null, 2), '```');
        }
      }
      if (msg.content) {
        lines.push(`**🤖 助手** · ${time}`, '', msg.content);
      }
    } else if (msg.role === 'tool') {
      lines.push(`**⚙️ 工具结果** \`${msg.toolCallId ?? ''}\``, '', '```json', msg.content, '```');
    }
  }
  return lines.join('\n');
}

/** 导出单条会话为 Markdown 文件 */
export async function exportConversationMarkdown(
  conversationId: string,
  title: string,
): Promise<void> {
  const db = Database.getInstance();
  const conversation = await db.getConversation(conversationId);
  if (!conversation) throw new Error('会话不存在');
  const messages = await db.getMessagesByConversation(conversationId);
  const md = renderConversationMarkdown(
    conversation as unknown as Conversation,
    messages as unknown as StoredMessage[],
  );
  download(`${safeName(title)}-${timestamp()}.md`, md, 'text/markdown');
}

/** 导出单条会话为 JSON 文件（完整结构） */
export async function exportConversationJson(conversationId: string, title: string): Promise<void> {
  const db = Database.getInstance();
  const conversation = await db.getConversation(conversationId);
  if (!conversation) throw new Error('会话不存在');
  const messages = await db.getMessagesByConversation(conversationId);
  const payload = {
    format: 'browser-agent-conversation' as const,
    version: 1 as const,
    exportedAt: Date.now(),
    conversation,
    messages,
  };
  download(`${safeName(title)}-${timestamp()}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

// ── 全量导出/导入 ────────────────────────────────────────

/** 导出全部数据（会话 + 配置）为 JSON 快照 */
export async function exportFullSnapshot(): Promise<void> {
  const db = Database.getInstance();
  const store = ConfigStore.getInstance();

  const conversations = await db.listConversationsByUpdatedAt();
  const withMessages = await Promise.all(
    conversations.map(async (conv) => ({
      ...conv,
      messages: await db.getMessagesByConversation(conv.id),
    })),
  );

  const settings: Record<string, unknown> = {};
  const keys: Array<keyof StorageSchema> = [
    'providers', 'agentSettings', 'expertModeSettings',
    'jevSettings', 'preferences', 'floatingButtonSettings',
    'skills', 'skillSubscriptions',
  ];
  for (const key of keys) {
    settings[key] = await store.get(key);
  }

  const snapshot: FullSnapshot = {
    format: 'browser-agent-snapshot',
    version: 1,
    exportedAt: Date.now(),
    conversations: withMessages,
    settings: redactSecrets(settings),
  };
  download(`browser-agent-backup-${timestamp()}.json`, JSON.stringify(snapshot, null, 2), 'application/json');
}

/** 导入校验结果 */
export interface ImportResult {
  conversations: number;
  messages: number;
  settingsKeys: string[];
}

/** 解析并校验快照文件内容 */
export function parseSnapshot(text: string): FullSnapshot {
  const data = JSON.parse(text) as FullSnapshot;
  if (data.format !== 'browser-agent-snapshot' || data.version !== 1) {
    throw new Error('不是有效的备份文件（format/version 不匹配）');
  }
  if (!Array.isArray(data.conversations)) {
    throw new Error('备份文件缺少会话数据');
  }
  return data;
}

/** 从快照导入：会话按 id upsert，配置按键合并（不删除现有数据） */
export async function importFullSnapshot(text: string): Promise<ImportResult> {
  const snapshot = parseSnapshot(text);
  const db = Database.getInstance();
  const store = ConfigStore.getInstance();

  let messageCount = 0;
  for (const conv of snapshot.conversations) {
    const { messages, ...conversation } = conv;
    await db.putConversation(conversation as never);
    if (messages.length > 0) {
      await db.putMessagesBatch(messages as never[]);
      messageCount += messages.length;
    }
  }

  const settings = { ...snapshot.settings };
  await restoreLocalSecrets(settings);

  const settingsKeys: string[] = [];
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined || !IMPORTABLE_SETTINGS_KEYS.has(key)) continue;
    await store.set(key as keyof StorageSchema, value);
    settingsKeys.push(key);
  }

  return { conversations: snapshot.conversations.length, messages: messageCount, settingsKeys };
}
