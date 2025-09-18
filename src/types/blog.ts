export interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Blog {
  id: number;
  name: string;
  slug: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  readTime: number;
  categoryIds: number[];
  published: boolean;
  markdownContent: string;
  categories?: Category[]; // populated when needed
}