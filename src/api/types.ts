export interface Attachment {
  type: "audio" | "image";
  src: string;
  origin?: "youtube";
  artist?: string;
  title?: string;
  genre?: string;
  width?: number;
  height?: number;
}

export interface Post {
  postId: string;
  authorId: string;
  authorUsername: string;
  content: string;
  topics?: string[];
  repliesCount: number;
  bookmarksCount: number;
  attachments?: Attachment[];
  hasImageAttachment?: boolean;
  hasAudioAttachment?: boolean;
  audioAttachmentGenre?: string;
  deleted: boolean;
  deletedAt?: Date;
  isPublic?: boolean;
  isNSFW?: boolean;
  createdAt: Date;
  guildId?: string;
  isGuildThread?: boolean;
  lastActivityAt?: Date;
}

export interface Reply {
  replyId: string;
  postId: string;
  parentReplyId?: string;
  parentReplyAuthor?: string;
  authorId: string;
  authorUsername: string;
  content: string;
  attachments?: Attachment[];
  hasImageAttachment?: boolean;
  hasAudioAttachment?: boolean;
  deleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  guildId?: string;
}

export interface User {
  userId: string;
  username: string;
  displayName?: string;
  bio?: string;
  profilePictureUrl?: string;
  pinnedPostId?: string;
  websiteUrl?: string;
  websiteName?: string;
  locationName?: string;
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  publicPostsCount?: number;
  createdAt?: Date;
  lastActiveAt?: Date;
  updatedAt?: Date;
}

export interface AuthTokens {
  idToken: string;
  refreshToken: string;
  rtdbToken?: string;
}

export interface Paginated<T> {
  data: T[];
  meta: { cursor: string | null };
}

const DATE_FIELDS = new Set([
  "createdAt",
  "deletedAt",
  "lastActivityAt",
  "nsfwMarkedAt",
  "updatedAt",
  "lastActiveAt",
  "bannedAt",
]);

/**
 * API returns ISO date strings. Convert them to Date objects in-place (shallow walk).
 */
export function hydrateDates<T>(obj: T): T {
  if (obj == null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    for (const item of obj) hydrateDates(item);
    return obj;
  }
  const rec = obj as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    const value = rec[key];
    if (DATE_FIELDS.has(key) && typeof value === "string") {
      rec[key] = new Date(value);
    } else if (value && typeof value === "object") {
      hydrateDates(value);
    }
  }
  return obj;
}
