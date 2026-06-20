declare module 'turndown' {
  class TurndownService {
    constructor(options?: {
      headingStyle?: 'setext' | 'atx';
      hr?: string;
      bulletListMarker?: '-' | '+' | '*';
      codeBlockStyle?: 'indented' | 'fenced';
      fence?: '```' | '~~~';
      emDelimiter?: '_' | '*';
      strongDelimiter?: '__' | '**';
      linkStyle?: 'inlined' | 'referenced';
      linkReferenceStyle?: 'full' | 'collapsed' | 'shortcut';
      preformattedCode?: boolean;
      blankReplacement?: (content: string, node: HTMLElement) => string;
    });

    addRule(
      key: string,
      rule: TurndownService.Rule,
    ): this;

    use(plugins: TurndownService.Plugin | TurndownService.Plugin[]): this;

    turndown(html: string | HTMLElement): string;
  }

  namespace TurndownService {
    interface Rule {
      filter: string | string[] | ((node: HTMLElement) => boolean);
      replacement: (content: string, node: HTMLElement) => string;
    }

    interface Plugin {
      (service: TurndownService): void;
    }
  }

  export default TurndownService;
}
