export interface PageContent {
  title: string;
  textContent: string;
  excerpt: string;
  byline: string | null;
  siteName: string | null;
}

export interface PageSelection {
  text: string;
  html?: string;
}

export interface PageMetadata {
  title: string;
  url: string;
  description: string | null;
  ogImage: string | null;
}
