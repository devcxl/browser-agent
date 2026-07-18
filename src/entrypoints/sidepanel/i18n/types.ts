/** 支持的语言 */
export type Locale = 'zh-CN' | 'en';

/** 语言包顶层接口 */
export interface MessageSchema {
  common: {
    send: string;
    cancel: string;
    confirm: string;
    delete: string;
    save: string;
    edit: string;
    add: string;
    close: string;
    loading: string;
    error: string;
    noData: string;
    enabled: string;
  };
  app: {
    title: string;
    loadingMessages: string;
    loadFailed: string;
  };
  sidebar: {
    title: string;
    newChat: string;
    collapse: string;
    expand: string;
    settings: string;
    noConversations: string;
    rename: string;
    delete: string;
    input: string;
    output: string;
    total: string;
    status: {
      idle: string;
      running: string;
      streaming: string;
      waitingConfirmation: string;
    };
  };
  chat: {
    emptyState: string;
    input: {
      placeholder: string;
      disabledPlaceholder: string;
      abort: string;
      send: string;
      voiceInput: string;
      requestingMic: string;
      stopRecording: string;
      transcribing: string;
      voiceError: string;
    };
    message: {
      showReasoning: string;
      hideReasoning: string;
      thinking: string;
      params: string;
      result: string;
      copy: string;
      copied: string;
    };
    configuration: {
      provider: string;
      model: string;
      reasoning: string;
      reasoningOff: string;
    };
  };
  settings: {
    title: string;
    language: string;
    tabs: {
      provider: string;
      agent: string;
      expert: string;
      skills: string;
    };
    provider: {
      noProviders: string;
      add: string;
      test: string;
      testing: string;
      trusted: string;
      voiceModel: string;
      audioFormat: string;
      audioFormatHint: string;
      trustedLabel: string;
      save: string;
      cancel: string;
      edit: string;
      delete: string;
      placeholder: {
        name: string;
        endpoint: string;
        apiKey: string;
        model: string;
        sttModel: string;
      };
      audioFormats: Record<string, string>;
    };
    agent: {
      maxToolRounds: string;
      maxContextMessages: string;
      contextWindowTokens: string;
      tokenBudgetMargin: string;
      microcompactKeepRecent: string;
      microcompactMinChars: string;
      microcompactExcludeTools: string;
      microcompactExcludeToolsPlaceholder: string;
      reasoningEffort: string;
      reasoningEffortHint: string;
      systemPrompt: string;
      reasoningOptions: {
        low: string;
        medium: string;
        high: string;
        max: string;
      };
    };
    expert: {
      title: string;
      subSwitchHint: string;
      domains: {
        proxy: string;
        debugger: string;
        management: string;
        privacy: string;
        webRequest: string;
        declarativeNetRequest: string;
        nativeMessaging: string;
      };
    };
    skills: {
      panelTitle: string;
      subscriptions: string;
      localSkills: string;
      placeholder: string;
      add: string;
      configToken: string;
      hideToken: string;
      tokenPlaceholder: string;
      noSubscriptions: string;
      noSubscriptionsAndSkills: string;
      sync: string;
      syncing: string;
      delete: string;
      skillsCount: string;
      enabled: string;
      syncComplete: string;
      syncFailed: string;
      subscriptionExists: string;
    };
  };
  dialog: {
    confirmTitle: string;
    tool: string;
    affectedObjects: string;
    type: string;
    title: string;
    reason: string;
    warnings: string;
    confirm: string;
    cancel: string;
  };
  browser: {
    title: string;
    loading: string;
    error: string;
    noData: string;
    windows: string;
    tabs: string;
    active: string;
    windowLabel: string;
  };
  token: {
    title: string;
    input: string;
    output: string;
    total: string;
    noData: string;
  };
  error: {
    renderError: string;
  };
  markdown: {
    invalidLink: string;
    contentExpired: string;
    previewTitle: string;
  };
  voice: {
    noSttModel: string;
    micDenied: string;
    noMic: string;
    startFailed: string;
    providerLost: string;
    transcribeFailed: string;
  };
}

/** I18n Context 值 */
export interface I18nContextValue {
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
  setLanguage: (lang: Locale) => Promise<void>;
}
