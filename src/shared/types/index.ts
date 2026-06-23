// 所有类型统一从 index.ts 导出，外部模块只 import 此文件

export type {
  Tab,
  Window,
  WindowType,
  WindowState,
  TabGroup,
  TabGroupColor,
  BrowserState,
  StateChanges,
  LowSensitivityContext,
  Capabilities,
  TabQueryInfo,
  TabCreateProperties,
  TabUpdateProperties,
  WindowGetInfo,
  WindowCreateData,
  WindowUpdateInfo,
  TabGroupQueryInfo,
  TabGroupUpdateProperties,
  HistoryItem,
  HistorySearchParams,
  HistoryDeleteParams,
  NotificationsCreateOptions,
  BookmarkSearchQuery,
  BookmarkCreateArg,
  BookmarkChangesArg,
  BookmarkTreeNode,
  DownloadQuery,
  DownloadOptions,
  DownloadItem,
  CookieDetails,
  CookieGetAllDetails,
  CookieSetDetails,
  Cookie,
  CookieStore,
  SessionFilter,
  Session,
  StorageGetParams,
  StorageSetParams,
  StorageRemoveParams,
} from './browser';

export type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  JsonRpcError,
  JsonRpcMessage,
  RpcMethodHandler,
  RpcNotificationHandler,
  IJsonRpcClient,
} from './jsonrpc';

export { JsonRpcErrorCode } from './jsonrpc';

export type {
  RiskLevel,
  ToolCategory,
  SensitivityLevel,
  PreflightAffectedObject,
  PreflightResult,
  ToolResult,
  ToolParameterSchema,
  OpenAIToolSchema,
  ToolDefinition,
  IToolRegistry,
  ToolCallRecord,
} from './tool';

export type {
  GuardrailContext,
  GuardrailCheck,
  IGuardrail,
} from './guardrail';

export type {
  ProviderConfig,
  ReasoningEffort,
  ToolCallDelta,
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamChunk,
  ILlmClient,
} from './llm';

export type {
  StoredMessage,
  Conversation,
  IConversationManager,
} from './conversation';

export type {
  AgentConfig,
  AgentRunInput,
  AgentRunOutput,
  ToolCallRecord,
  IAgentRuntime,
} from './agent';

export type {
  StorageSchema,
  AgentSettings,
  ExpertModeSettings,
  UserPreferences,
  DbConversation,
  DbMessage,
  DbToolCallLog,
  DbSnapshot,
  IConfigStore,
} from './storage';

export { DB_NAME, DB_VERSION } from './storage';

export type { Skill, ISkillStore } from './skill';
