export interface User {
  id: string;
  username: string;
  name: string;
  avatarUrl?: string;
  bio?: string;
  followersCount: number;
  followingCount: number;
}

export interface Post {
  id: string;
  authorId: string;
  authorUsername: string;
  authorAvatarUrl?: string;
  caption: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  aspectRatio: number;
  likesCount: number;
  commentsCount: number;
  hasLiked: boolean;
  hasSaved: boolean;
  moderationStatus: "pending" | "approved" | "flagged" | "rejected";
  aiTags: string[];
  createdAt: string;
}

export interface Story {
  id: string;
  userId: string;
  username: string;
  avatarUrl: string;
  hasUnseen: boolean;
}
