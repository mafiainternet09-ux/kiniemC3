export type YearCode = '10A3' | '11B3' | '12C3';

export type EventSlug =
  | '20-10'
  | '19-11'
  | '20-11'
  | '08-03'
  | 'hoi-trai'
  | 'ky-yeu'
  | 'ky-niem-khac';

export type MediaType = 'image' | 'video';

export type UserRole = 'admin' | 'member' | 'pending' | 'guest';

export type RouteView =
  | { page: 'home' }
  | { page: 'year'; year: YearCode; eventSlug?: string }
  | { page: 'yearbook' }
  | { page: 'classroom'; seatNumber?: number }
  | { page: 'admin' };

export interface SiteConfig {
  siteName: string;
  schoolName: string;
  slogan: string;
  heroTitle: string;
  heroSubtitle: string;
  introStory: string;
  musicTitle: string;
  musicArtist: string;
  musicYoutubeId: string;
  allowDemoPreview: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface UserDirectoryEntry {
  uid: string;
  displayName: string;
  photoURL?: string;
  email?: string;
  role: 'admin' | 'member' | 'pending';
  seatNumber?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface YearEvent {
  id: string;
  yearCode: YearCode;
  slug: EventSlug | string;
  title: string;
  dateLabel: string;
  summary: string;
  coverImageUrl?: string;
  coverStoragePath?: string;
  order: number;
  isSpecial: boolean;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface MediaItem {
  id: string;
  yearCode: YearCode;
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  mediaType: MediaType;
  title: string;
  caption?: string;
  url: string;
  storagePath?: string;
  thumbnailUrl?: string;
  thumbnailStoragePath?: string;
  durationSec?: number;
  tags?: string[];
  featuredOnHome: boolean;
  isYearbookSpread: boolean;
  isDemo: boolean;
  status: 'approved' | 'pending' | 'removed';
  uploadedBy: string;
  uploadedByName: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ClassroomSeat {
  seatId: string;
  seatNumber: number;
  row: number;
  col: number;
  memberName: string;
  nickname?: string;
  avatarUrl?: string;
  avatarStoragePath?: string;
  bio?: string;
  quote?: string;
  favoriteSubject?: string;
  linkedMediaIds?: string[];
  isAssigned: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface GuestbookNote {
  id: string;
  authorUid: string;
  authorName: string;
  yearTag: '10A3' | '11B3' | '12C3' | 'C3';
  message: string;
  status: 'approved' | 'pending';
  createdAt?: string;
  updatedAt?: string;
}

export interface MediaSubmission {
  id: string;
  yearCode: YearCode;
  eventId: string;
  eventSlug: string;
  mediaType: MediaType;
  title: string;
  caption?: string;
  url: string;
  storagePath?: string;
  thumbnailUrl?: string;
  tags?: string[];
  submittedBy: string;
  submittedByName: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewNote?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RemovalRequest {
  id: string;
  mediaId: string;
  mediaTitle: string;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  status: 'pending' | 'resolved' | 'dismissed';
  adminNote?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ParsedSearchIntent {
  yearCode: YearCode | null;
  eventSlug: EventSlug | null;
  mediaType: MediaType | null;
  keywords: string[];
  reply: string;
  usedGemini: boolean;
}

export type MusicCommand = 'play' | 'pause' | 'mute' | 'unmute' | 'expand' | 'collapse';

export type AssistantAction =
  | { type: 'navigate'; route: RouteView; label: string }
  | { type: 'open_media'; mediaId: string; label: string }
  | { type: 'control_music'; command: MusicCommand; label: string }
  | {
      type: 'write_guestbook';
      yearTag: GuestbookNote['yearTag'];
      message: string;
      label: string;
    }
  | {
      type: 'update_seat';
      seatNumber: number;
      memberName?: string;
      nickname?: string;
      bio?: string;
      quote?: string;
      favoriteSubject?: string;
      label: string;
    }
  | {
      type: 'open_contribute';
      yearCode?: YearCode;
      eventSlug?: string;
      label: string;
    }
  | { type: 'open_login'; label: string };

export interface AssistantChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AssistantChatResponse {
  reply: string;
  matches: MediaItem[];
  seats?: ClassroomSeat[];
  actions: AssistantAction[];
  usedGemini: boolean;
  apiNotice?: string;
}

