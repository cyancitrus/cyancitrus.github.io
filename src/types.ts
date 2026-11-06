export type Post = {
  id: string;
  title: string;
  category: string;
  body: string;
  secret?: { version: 1; salt: string; iv: string; data: string };
  pinned: boolean;
  publishedAt: string;
  updatedAt: string;
};

export type Draft = Post & { draft: true };

export type SiteSettings = {
  heroTitle: string;
  heroSubtitle: string;
};
