// Shapes returned by the backend. Kept in one place so components and hooks agree.

export type Tag = { id: number; name: string };

export type Contact = {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  tags: Tag[];
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ContactPage = { items: Contact[]; nextCursor: string | null };

export type SortField = 'name' | 'createdAt';
export type SortOrder = 'asc' | 'desc';

export type ContactListParams = {
  q: string;
  tags: string[];
  company: string;
  sort: SortField;
  order: SortOrder;
  cursor: string | null;
};

export type BulkTagResult = {
  tag: Tag;
  added: number;
  alreadyTagged: number;
  notFound: number[];
};

export type ActivityType = 'CONTACT_UPDATED' | 'TAG_ADDED' | 'TAG_REMOVED';

export type Activity = {
  id: number;
  contactId: number;
  type: ActivityType;
  payload: {
    changes?: Record<string, { from: unknown; to: unknown }>;
    tag?: string;
    bulk?: boolean;
  };
  createdAt: string;
};
