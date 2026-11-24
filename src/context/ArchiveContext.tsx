import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  BOOTSTRAP_ADMIN_EMAIL,
  db,
  formatFirestoreErrorForUi,
  googleProvider,
  handleFirestoreError,
  OperationType,
  reportFirestoreError,
} from '../lib/firebase';
import {
  DEFAULT_EVENTS,
  DEFAULT_GUESTBOOK_DEMO,
  DEFAULT_SEATS,
  DEFAULT_SITE_CONFIG,
  DEMO_MEDIA_ITEMS,
} from '../data/seedCatalog';
import {
  extractYoutubeVideoId,
  normalizeTimestampToIso,
  resolveTimestampMs,
  sanitizeFirestoreId,
  sanitizeTags,
  swapSeatAssignments,
  truncateText,
} from '../utils/memorySearch';
import type {
  ClassroomSeat,
  GuestbookNote,
  MediaItem,
  MediaSubmission,
  RemovalRequest,
  RouteView,
  SiteConfig,
  UserDirectoryEntry,
  UserRole,
  YearEvent,
} from '../types/memory';

interface ArchiveContextValue {
  route: RouteView;
  navigate: (next: RouteView) => void;
  user: User | null;
  authReady: boolean;
  userRole: UserRole;
  isAuthorized: boolean;
  isAdmin: boolean;
  demoPreviewActive: boolean;
  setDemoPreviewActive: (active: boolean) => void;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  authError: string | null;
  firestoreError: string | null;
  dismissFirestoreError: () => void;

  siteConfig: SiteConfig;
  events: YearEvent[];
  media: MediaItem[];
  seats: ClassroomSeat[];
  guestbook: GuestbookNote[];
  usersDirectory: UserDirectoryEntry[];
  submissions: MediaSubmission[];
  removalRequests: RemovalRequest[];
  hasCloudEvents: boolean;
  hasCloudSeats: boolean;

  updateSiteConfig: (patch: Partial<SiteConfig>) => Promise<void>;
  seedInitialArchiveToFirestore: () => Promise<void>;
  saveEvent: (event: YearEvent) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
  saveMediaItem: (item: MediaItem) => Promise<void>;
  deleteMediaItem: (mediaId: string) => Promise<void>;
  saveSeat: (seat: ClassroomSeat) => Promise<void>;
  swapSeats: (seatNumA: number, seatNumB: number) => Promise<void>;
  addGuestbookNote: (yearTag: GuestbookNote['yearTag'], message: string) => Promise<void>;
  deleteGuestbookNote: (entryId: string) => Promise<void>;
  publishMemberMedia: (payload: {
    yearCode: MediaItem['yearCode'];
    eventId: string;
    eventSlug: string;
    eventTitle: string;
    mediaType: MediaItem['mediaType'];
    title: string;
    caption?: string;
    url: string;
    storagePath?: string;
    thumbnailUrl?: string;
    thumbnailStoragePath?: string;
    durationSec?: number;
    tags?: string[];
  }) => Promise<MediaItem | void>;
  submitMemberMedia: (
    payload: Omit<MediaSubmission, 'id' | 'submittedBy' | 'submittedByName' | 'status'>
  ) => Promise<void>;
  moderateSubmission: (
    submission: MediaSubmission,
    decision: 'approved' | 'rejected',
    reviewNote?: string
  ) => Promise<void>;
  submitRemovalRequest: (media: MediaItem, reason: string) => Promise<void>;
  resolveRemovalRequest: (
    reqItem: RemovalRequest,
    decision: 'resolved' | 'dismissed',
    adminNote?: string
  ) => Promise<void>;
  updateUserRole: (uid: string, role: 'admin' | 'member' | 'pending') => Promise<void>;
  exportBackupJson: () => void;
}

const ArchiveContext = createContext<ArchiveContextValue | null>(null);

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${rand}`;
}

export const ArchiveProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [route, setRoute] = useState<RouteView>({ page: 'home' });
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>('guest');
  const [demoPreviewActive, setDemoPreviewActive] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  const [siteConfig, setSiteConfig] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [cloudEvents, setCloudEvents] = useState<YearEvent[]>([]);
  const [cloudMedia, setCloudMedia] = useState<MediaItem[]>([]);
  const [cloudSeats, setCloudSeats] = useState<ClassroomSeat[]>([]);
  const [cloudGuestbook, setCloudGuestbook] = useState<GuestbookNote[]>([]);
  const [usersDirectory, setUsersDirectory] = useState<UserDirectoryEntry[]>([]);
  const [submissions, setSubmissions] = useState<MediaSubmission[]>([]);
  const [removalRequests, setRemovalRequests] = useState<RemovalRequest[]>([]);

  const autoSeededUidRef = useRef<string | null>(null);

  const dismissFirestoreError = useCallback(() => setFirestoreError(null), []);

  const navigate = useCallback((next: RouteView) => {
    setRoute(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Always read public non-PII siteConfig/main for title, slogan & music config
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'siteConfig', 'main'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as SiteConfig;
          setSiteConfig({ ...DEFAULT_SITE_CONFIG, ...data });
          setDemoPreviewActive(data.allowDemoPreview ?? true);
        }
      },
      (err) => {
        // Only surface non-permission connectivity errors for public config doc
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.toLowerCase().includes('permission')) {
          reportFirestoreError(err, OperationType.GET, 'siteConfig/main');
        }
      }
    );
    return () => unsub();
  }, []);

  // Auth listener & user registration
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthError(null);
      setFirestoreError(null);

      if (!firebaseUser) {
        autoSeededUidRef.current = null;
        setUserRole('guest');
        setCloudEvents([]);
        setCloudMedia([]);
        setCloudSeats([]);
        setCloudGuestbook([]);
        setUsersDirectory([]);
        setSubmissions([]);
        setRemovalRequests([]);
        setAuthReady(true);
        return;
      }

      try {
        const isBootstrappedAdmin =
          Boolean(firebaseUser.emailVerified) &&
          firebaseUser.email === BOOTSTRAP_ADMIN_EMAIL;

        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const existingSnap = await getDoc(userDocRef);

        if (!existingSnap.exists()) {
          const initialRole = isBootstrappedAdmin ? 'admin' : 'pending';
          await setDoc(userDocRef, {
            uid: firebaseUser.uid,
            displayName: truncateText(firebaseUser.displayName, 100, 'Thành viên C3'),
            photoURL: truncateText(firebaseUser.photoURL, 500, ''),
            role: initialRole,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          if (firebaseUser.email) {
            await setDoc(doc(db, 'users', firebaseUser.uid, 'private', 'profile'), {
              uid: firebaseUser.uid,
              email: truncateText(firebaseUser.email, 200),
              updatedAt: serverTimestamp(),
            });
          }
          if (isBootstrappedAdmin) {
            await setDoc(doc(db, 'admins', firebaseUser.uid), {
              uid: firebaseUser.uid,
              grantedBy: 'bootstrap',
              createdAt: serverTimestamp(),
            });
          }
          setUserRole(initialRole);
        } else {
          const data = existingSnap.data() as UserDirectoryEntry;
          let resolvedRole: UserRole = data.role || 'pending';
          if (isBootstrappedAdmin) {
            resolvedRole = 'admin';
            if (data.role !== 'admin') {
              await updateDoc(userDocRef, {
                role: 'admin',
                updatedAt: serverTimestamp(),
              });
            }
            const adminSnap = await getDoc(doc(db, 'admins', firebaseUser.uid));
            if (!adminSnap.exists()) {
              await setDoc(doc(db, 'admins', firebaseUser.uid), {
                uid: firebaseUser.uid,
                grantedBy: 'bootstrap',
                createdAt: serverTimestamp(),
              });
            }
          } else {
            const adminSnap = await getDoc(doc(db, 'admins', firebaseUser.uid));
            if (adminSnap.exists()) resolvedRole = 'admin';
          }
          setUserRole(resolvedRole);
        }
      } catch (err) {
        reportFirestoreError(err, OperationType.WRITE, `users/${firebaseUser.uid}`);
        setFirestoreError(formatFirestoreErrorForUi(err));
        if (
          firebaseUser.emailVerified &&
          firebaseUser.email === BOOTSTRAP_ADMIN_EMAIL
        ) {
          setUserRole('admin');
        } else {
          setUserRole('pending');
        }
      } finally {
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, []);

  const isAdmin = userRole === 'admin';
  const isAuthorized = userRole === 'admin' || userRole === 'member';

  // Live Firestore subscriptions ONLY when authenticated & authorized
  useEffect(() => {
    if (!authReady || !user || !isAuthorized) return;

    const unsubs: Array<() => void> = [];

    const onListenerError = (path: string) => (err: unknown) => {
      reportFirestoreError(err, OperationType.LIST, path);
      setFirestoreError(formatFirestoreErrorForUi(err));
    };

    // Match Firestore rules: yearCode in ['10A3', '11B3', '12C3']; sort by order client-side to avoid composite index requirement
    unsubs.push(
      onSnapshot(
        query(collection(db, 'events'), where('yearCode', 'in', ['10A3', '11B3', '12C3'])),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data() as YearEvent)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          setCloudEvents(list);
        },
        onListenerError('events')
      )
    );

    // Match Firestore rules: admins list all media; members must filter status == 'approved'
    const mediaQuery = isAdmin
      ? collection(db, 'media')
      : query(collection(db, 'media'), where('status', '==', 'approved'));
    unsubs.push(
      onSnapshot(
        mediaQuery,
        (snap) => {
          setCloudMedia(snap.docs.map((d) => d.data() as MediaItem));
        },
        onListenerError('media')
      )
    );

    // Match Firestore rules: seatNumber >= 1 && seatNumber <= 50
    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'seats'),
          where('seatNumber', '>=', 1),
          where('seatNumber', '<=', 50),
          orderBy('seatNumber', 'asc')
        ),
        (snap) => {
          setCloudSeats(snap.docs.map((d) => d.data() as ClassroomSeat));
        },
        onListenerError('seats')
      )
    );

    // Match Firestore rules: admins list all guestbook; members must filter status == 'approved'
    const guestbookQuery = isAdmin
      ? collection(db, 'guestbook')
      : query(collection(db, 'guestbook'), where('status', '==', 'approved'));
    unsubs.push(
      onSnapshot(
        guestbookQuery,
        (snap) => {
          const list = snap.docs
            .map((d) => {
              const raw = d.data() as Record<string, unknown>;
              return {
                ...(raw as unknown as GuestbookNote),
                createdAt:
                  normalizeTimestampToIso(raw.createdAt, d.id) ??
                  new Date().toISOString(),
                updatedAt: normalizeTimestampToIso(raw.updatedAt, d.id),
              } satisfies GuestbookNote;
            })
            .sort((a, b) => {
              const msA = resolveTimestampMs(a.createdAt, a.id) ?? 0;
              const msB = resolveTimestampMs(b.createdAt, b.id) ?? 0;
              return msB - msA;
            });
          setCloudGuestbook(list);
        },
        onListenerError('guestbook')
      )
    );

    if (isAdmin) {
      unsubs.push(
        onSnapshot(
          collection(db, 'users'),
          (snap) => {
            setUsersDirectory(snap.docs.map((d) => d.data() as UserDirectoryEntry));
          },
          onListenerError('users')
        )
      );
      unsubs.push(
        onSnapshot(
          collection(db, 'submissions'),
          (snap) => {
            setSubmissions(snap.docs.map((d) => d.data() as MediaSubmission));
          },
          onListenerError('submissions')
        )
      );
      unsubs.push(
        onSnapshot(
          collection(db, 'removalRequests'),
          (snap) => {
            setRemovalRequests(snap.docs.map((d) => d.data() as RemovalRequest));
          },
          onListenerError('removalRequests')
        )
      );
    }

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [authReady, user, isAuthorized, isAdmin]);

  // Idempotent seed: only creates missing siteConfig/main, events, and seats so existing createdAt timestamps are never violated
  const seedInitialArchiveToFirestore = useCallback(async () => {
    if (!user || !isAdmin) {
      throw new Error('Chỉ Quản trị viên C3 mới có quyền khởi tạo dữ liệu gốc.');
    }
    try {
      const [siteSnap, eventsSnap, seatsSnap] = await Promise.all([
        getDoc(doc(db, 'siteConfig', 'main')),
        getDocs(query(collection(db, 'events'), where('yearCode', 'in', ['10A3', '11B3', '12C3']))),
        getDocs(
          query(
            collection(db, 'seats'),
            where('seatNumber', '>=', 1),
            where('seatNumber', '<=', 50)
          )
        ),
      ]);

      const existingEventIds = new Set(eventsSnap.docs.map((d) => d.id));
      const existingSeatIds = new Set(seatsSnap.docs.map((d) => d.id));

      const batch = writeBatch(db);
      let writeCount = 0;

      if (!siteSnap.exists()) {
        batch.set(doc(db, 'siteConfig', 'main'), {
          siteName: truncateText(siteConfig.siteName, 100, DEFAULT_SITE_CONFIG.siteName),
          schoolName: truncateText(siteConfig.schoolName, 100, DEFAULT_SITE_CONFIG.schoolName),
          slogan: truncateText(siteConfig.slogan, 240, DEFAULT_SITE_CONFIG.slogan),
          heroTitle: truncateText(siteConfig.heroTitle, 160, DEFAULT_SITE_CONFIG.heroTitle),
          heroSubtitle: truncateText(siteConfig.heroSubtitle, 400, DEFAULT_SITE_CONFIG.heroSubtitle),
          introStory: truncateText(siteConfig.introStory, 2000, DEFAULT_SITE_CONFIG.introStory),
          musicTitle: truncateText(siteConfig.musicTitle, 120, DEFAULT_SITE_CONFIG.musicTitle),
          musicArtist: truncateText(siteConfig.musicArtist, 120, DEFAULT_SITE_CONFIG.musicArtist),
          musicYoutubeId: extractYoutubeVideoId(siteConfig.musicYoutubeId),
          allowDemoPreview: Boolean(siteConfig.allowDemoPreview),
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });
        writeCount += 1;
      }

      for (const ev of DEFAULT_EVENTS) {
        if (!existingEventIds.has(ev.id)) {
          batch.set(doc(db, 'events', ev.id), {
            id: ev.id,
            yearCode: ev.yearCode,
            slug: ev.slug,
            title: truncateText(ev.title, 140),
            dateLabel: truncateText(ev.dateLabel, 80),
            summary: truncateText(ev.summary, 1200),
            coverImageUrl: truncateText(ev.coverImageUrl, 1000),
            coverStoragePath: truncateText(ev.coverStoragePath, 400),
            order: ev.order,
            isSpecial: Boolean(ev.isSpecial),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          });
          writeCount += 1;
        }
      }

      for (const seat of DEFAULT_SEATS) {
        if (!existingSeatIds.has(seat.seatId)) {
          batch.set(doc(db, 'seats', seat.seatId), {
            seatId: seat.seatId,
            seatNumber: seat.seatNumber,
            row: seat.row,
            col: seat.col,
            memberName: truncateText(seat.memberName, 100),
            nickname: truncateText(seat.nickname, 80),
            avatarUrl: truncateText(seat.avatarUrl, 1000),
            avatarStoragePath: truncateText(seat.avatarStoragePath, 400),
            bio: truncateText(seat.bio, 600),
            quote: truncateText(seat.quote, 280),
            favoriteSubject: truncateText(seat.favoriteSubject, 80),
            linkedMediaIds: sanitizeTags(seat.linkedMediaIds, 12),
            isAssigned: Boolean(seat.isAssigned),
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          });
          writeCount += 1;
        }
      }

      if (writeCount > 0) {
        await batch.commit();
      }
      setFirestoreError(null);
    } catch (err) {
      setFirestoreError(formatFirestoreErrorForUi(err));
      handleFirestoreError(err, OperationType.WRITE, 'seedInitialArchive');
    }
  }, [user, isAdmin, siteConfig]);

  // Auto-bootstrap missing initial docs once per Admin login so event uploads always find their parent event doc
  useEffect(() => {
    if (!authReady || !user || !isAdmin) return;
    if (autoSeededUidRef.current === user.uid) return;
    autoSeededUidRef.current = user.uid;
    void seedInitialArchiveToFirestore().catch(() => {
      // Already logged and surfaced via firestoreError state
    });
  }, [authReady, user, isAdmin, seedInitialArchiveToFirestore]);

  const ensureEventDocExists = useCallback(
    async (eventId: string) => {
      if (!user || !isAdmin) return;
      if (cloudEvents.some((e) => e.id === eventId)) return;
      const evRef = doc(db, 'events', eventId);
      const snap = await getDoc(evRef);
      if (snap.exists()) return;
      const def = DEFAULT_EVENTS.find((e) => e.id === eventId);
      if (!def) return;
      await setDoc(evRef, {
        id: def.id,
        yearCode: def.yearCode,
        slug: def.slug,
        title: truncateText(def.title, 140),
        dateLabel: truncateText(def.dateLabel, 80),
        summary: truncateText(def.summary, 1200),
        coverImageUrl: truncateText(def.coverImageUrl, 1000),
        coverStoragePath: truncateText(def.coverStoragePath, 400),
        order: def.order,
        isSpecial: Boolean(def.isSpecial),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
    },
    [user, isAdmin, cloudEvents]
  );

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Đăng nhập thất bại.';
      setAuthError(msg);
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    setRoute({ page: 'home' });
  }, []);

  const updateSiteConfig = useCallback(
    async (patch: Partial<SiteConfig>) => {
      if (!user || !isAdmin) {
        throw new Error('Chỉ Quản trị viên C3 mới có quyền cập nhật cấu hình trang chủ.');
      }
      const merged = { ...siteConfig, ...patch };
      const cleanPayload = {
        siteName: truncateText(merged.siteName, 100, DEFAULT_SITE_CONFIG.siteName),
        schoolName: truncateText(merged.schoolName, 100, DEFAULT_SITE_CONFIG.schoolName),
        slogan: truncateText(merged.slogan, 240, DEFAULT_SITE_CONFIG.slogan),
        heroTitle: truncateText(merged.heroTitle, 160, DEFAULT_SITE_CONFIG.heroTitle),
        heroSubtitle: truncateText(merged.heroSubtitle, 400),
        introStory: truncateText(merged.introStory, 2000),
        musicTitle: truncateText(merged.musicTitle, 120, DEFAULT_SITE_CONFIG.musicTitle),
        musicArtist: truncateText(merged.musicArtist, 120, DEFAULT_SITE_CONFIG.musicArtist),
        musicYoutubeId: extractYoutubeVideoId(merged.musicYoutubeId),
        allowDemoPreview: Boolean(merged.allowDemoPreview),
      };
      try {
        await setDoc(doc(db, 'siteConfig', 'main'), {
          ...cleanPayload,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });
        setSiteConfig(cleanPayload);
        setFirestoreError(null);
      } catch (err) {
        setFirestoreError(formatFirestoreErrorForUi(err));
        handleFirestoreError(err, OperationType.WRITE, 'siteConfig/main');
      }
    },
    [user, isAdmin, siteConfig]
  );

  const saveEvent = useCallback(
    async (event: YearEvent) => {
      if (!user || !isAdmin) {
        throw new Error('Chỉ Quản trị viên C3 mới có quyền tạo hoặc chỉnh sửa sự kiện.');
      }
      const cleanId = sanitizeFirestoreId(event.id, 'ev');
      const cleanSlug = sanitizeFirestoreId(event.slug, 'su-kien').slice(0, 64);
      const cleanFields = {
        yearCode: event.yearCode,
        slug: cleanSlug,
        title: truncateText(event.title, 140, 'Sự kiện C3'),
        dateLabel: truncateText(event.dateLabel, 80, 'Năm học C3'),
        summary: truncateText(event.summary, 1200, 'Kỷ niệm đáng nhớ của tập thể C3'),
        coverImageUrl: truncateText(event.coverImageUrl, 1000),
        coverStoragePath: truncateText(event.coverStoragePath, 400),
        order: Math.max(0, Math.min(100, Math.round(Number(event.order) || 1))),
        isSpecial: Boolean(event.isSpecial),
      };
      try {
        const evRef = doc(db, 'events', cleanId);
        const snap = await getDoc(evRef);
        if (snap.exists()) {
          await updateDoc(evRef, {
            ...cleanFields,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          });
        } else {
          await setDoc(evRef, {
            id: cleanId,
            ...cleanFields,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          });
        }
        setFirestoreError(null);
      } catch (err) {
        setFirestoreError(formatFirestoreErrorForUi(err));
        handleFirestoreError(err, OperationType.WRITE, `events/${cleanId}`);
      }
    },
    [user, isAdmin]
  );

  const deleteEvent = useCallback(
    async (eventId: string) => {
      if (!user || !isAdmin) {
        throw new Error('Chỉ Quản trị viên C3 mới có quyền xóa sự kiện.');
      }
      try {
        await deleteDoc(doc(db, 'events', eventId));
        setFirestoreError(null);
      } catch (err) {
        setFirestoreError(formatFirestoreErrorForUi(err));
        handleFirestoreError(err, OperationType.DELETE, `events/${eventId}`);
      }
    },
    [user, isAdmin]
  );

  const saveMediaItem = useCallback(
    async (item: MediaItem) => {
      if (!user || !isAdmin) {
        throw new Error('Chỉ Quản trị viên C3 mới có quyền chỉnh sửa mục phương tiện này.');
      }
      if (!item.url || !item.url.trim()) {
        throw new Error('Đường dẫn tệp phương tiện không được để trống.');
      }
      const cleanId = sanitizeFirestoreId(item.id, 'mem');
      const cleanEventId = sanitizeFirestoreId(item.eventId, '12c3-ky-yeu');
      const cleanTags = sanitizeTags(item.tags, 10);
      const commonFields = {
        yearCode: item.yearCode,
        eventId: cleanEventId,
        eventSlug: truncateText(item.eventSlug, 64, 'ky-yeu'),
        eventTitle: truncateText(item.eventTitle, 140, 'Kỷ niệm C3'),
        mediaType: item.mediaType,
        title: truncateText(item.title, 160, 'Khoảnh khắc C3'),
        caption: truncateText(item.caption, 800),
        url: truncateText(item.url, 1500),
        storagePath: truncateText(item.storagePath, 500),
        thumbnailUrl: truncateText(item.thumbnailUrl, 1500),
        thumbnailStoragePath: truncateText(item.thumbnailStoragePath, 500),
        durationSec: Math.max(0, Number(item.durationSec ?? 0) || 0),
        tags: cleanTags,
        featuredOnHome: Boolean(item.featuredOnHome),
        isYearbookSpread: Boolean(item.isYearbookSpread),
        isDemo: Boolean(item.isDemo),
        status: item.status,
      };
      try {
        await ensureEventDocExists(cleanEventId);
        const mediaRef = doc(db, 'media', cleanId);
        const snap = await getDoc(mediaRef);
        if (snap.exists()) {
          await updateDoc(mediaRef, {
            ...commonFields,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(mediaRef, {
            id: cleanId,
            ...commonFields,
            uploadedBy: user.uid,
            uploadedByName: truncateText(user.displayName, 100, 'Quản trị viên'),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        setFirestoreError(null);
      } catch (err) {
        setFirestoreError(formatFirestoreErrorForUi(err));
        handleFirestoreError(err, OperationType.WRITE, `media/${cleanId}`);
      }
    },
    [user, isAdmin, ensureEventDocExists]
  );

  const deleteMediaItem = useCallback(
    async (mediaId: string) => {
      if (!user || !isAuthorized) {
        throw new Error('Bạn cần đăng nhập tài khoản thành viên C3 được duyệt để xóa tư liệu.');
      }
      try {
        const mediaRef = doc(db, 'media', mediaId);
        const mediaSnap = await getDoc(mediaRef);
        const mediaData = mediaSnap.exists() ? mediaSnap.data() : null;
        const isCloudinaryAsset =
          typeof mediaData?.storagePath === 'string' &&
          mediaData.storagePath.startsWith('cloudinary:');

        if (isCloudinaryAsset) {
          const token = await user.getIdToken();
          const response = await fetch('/api/media/delete', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + token,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ mediaId }),
          });
          let result: { error?: string } = {};
          try {
            result = (await response.json()) as { error?: string };
          } catch {
            // Keep the document if the storage deletion could not be confirmed.
          }
          if (!response.ok) {
            throw new Error(result.error || 'Không thể xóa tệp khỏi Cloudinary.');
          }
        }

        await deleteDoc(mediaRef);
        setFirestoreError(null);
      } catch (err) {
        setFirestoreError(formatFirestoreErrorForUi(err));
        handleFirestoreError(err, OperationType.DELETE, `media/${mediaId}`);
      }
    },
    [user, isAuthorized]
  );

  const saveSeat = useCallback(
    async (seat: ClassroomSeat) => {
      if (!user || !isAdmin) {
        throw new Error('Chỉ Quản trị viên C3 mới có quyền chỉnh sửa vị trí phòng học.');
      }
      try {
        await setDoc(doc(db, 'seats', seat.seatId), {
          seatId: seat.seatId,
          seatNumber: seat.seatNumber,
          row: seat.row,
          col: seat.col,
          memberName: truncateText(seat.memberName, 100, `Vị trí ${String(seat.seatNumber).padStart(2, '0')}`),
          nickname: truncateText(seat.nickname, 80),
          avatarUrl: truncateText(seat.avatarUrl, 1000),
          avatarStoragePath: truncateText(seat.avatarStoragePath, 400),
          bio: truncateText(seat.bio, 600),
          quote: truncateText(seat.quote, 280),
          favoriteSubject: truncateText(seat.favoriteSubject, 80),
          linkedMediaIds: sanitizeTags(seat.linkedMediaIds, 12),
          isAssigned: Boolean(seat.isAssigned),
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });
        setFirestoreError(null);
      } catch (err) {
        setFirestoreError(formatFirestoreErrorForUi(err));
        handleFirestoreError(err, OperationType.WRITE, `seats/${seat.seatId}`);
      }
    },
    [user, isAdmin]
  );

  const swapSeats = useCallback(
    async (seatNumA: number, seatNumB: number) => {
      if (!user || !isAdmin) {
        throw new Error('Chỉ Quản trị viên C3 mới có quyền đổi chỗ ngồi.');
      }
      const source = cloudSeats.length > 0 ? cloudSeats : DEFAULT_SEATS;
      const updated = swapSeatAssignments(source, seatNumA, seatNumB, user.uid);
      const seatA = updated.find((s) => s.seatNumber === seatNumA);
      const seatB = updated.find((s) => s.seatNumber === seatNumB);
      if (!seatA || !seatB) return;
      const toPayload = (seat: ClassroomSeat) => ({
        seatId: seat.seatId,
        seatNumber: seat.seatNumber,
        row: seat.row,
        col: seat.col,
        memberName: truncateText(seat.memberName, 100),
        nickname: truncateText(seat.nickname, 80),
        avatarUrl: truncateText(seat.avatarUrl, 1000),
        avatarStoragePath: truncateText(seat.avatarStoragePath, 400),
        bio: truncateText(seat.bio, 600),
        quote: truncateText(seat.quote, 280),
        favoriteSubject: truncateText(seat.favoriteSubject, 80),
        linkedMediaIds: sanitizeTags(seat.linkedMediaIds, 12),
        isAssigned: Boolean(seat.isAssigned),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'seats', seatA.seatId), toPayload(seatA));
        batch.set(doc(db, 'seats', seatB.seatId), toPayload(seatB));
        await batch.commit();
        setFirestoreError(null);
      } catch (err) {
        setFirestoreError(formatFirestoreErrorForUi(err));
        handleFirestoreError(err, OperationType.WRITE, 'seats/swap');
      }
    },
    [user, isAdmin, cloudSeats]
  );

  const addGuestbookNote = useCallback(
    async (yearTag: GuestbookNote['yearTag'], message: string) => {
      if (!user || !isAuthorized) {
        throw new Error('Vui lòng đăng nhập bằng tài khoản thành viên C3 được duyệt để gửi lưu bút.');
      }
      const cleanMessage = truncateText(message, 600);
      if (cleanMessage.length < 2) {
        throw new Error('Lời nhắn lưu bút cần tối thiểu 2 ký tự.');
      }
      const id = makeId('gb');
      try {
        await setDoc(doc(db, 'guestbook', id), {
          id,
          authorUid: user.uid,
          authorName: truncateText(user.displayName, 100, 'Thành viên C3'),
          yearTag,
          message: cleanMessage,
          status: 'approved',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setFirestoreError(null);
      } catch (err) {
        setFirestoreError(formatFirestoreErrorForUi(err));
        handleFirestoreError(err, OperationType.CREATE, `guestbook/${id}`);
      }
    },
    [user, isAuthorized]
  );

  const deleteGuestbookNote = useCallback(
    async (entryId: string) => {
      if (!user || !isAuthorized) {
        throw new Error('Bạn cần đăng nhập bằng tài khoản thành viên C3 được duyệt để xóa lưu bút.');
      }
      try {
        await deleteDoc(doc(db, 'guestbook', entryId));
        setFirestoreError(null);
      } catch (err) {
        setFirestoreError(formatFirestoreErrorForUi(err));
        handleFirestoreError(err, OperationType.DELETE, `guestbook/${entryId}`);
      }
    },
    [user, isAuthorized]
  );

  const publishMemberMedia = useCallback(
    async (payload: {
      yearCode: MediaItem['yearCode'];
      eventId: string;
      eventSlug: string;
      eventTitle: string;
      mediaType: MediaItem['mediaType'];
      title: string;
      caption?: string;
      url: string;
      storagePath?: string;
      thumbnailUrl?: string;
      thumbnailStoragePath?: string;
      durationSec?: number;
      tags?: string[];
    }) => {
      if (!user || !isAuthorized) {
        throw new Error('Vui lòng đăng nhập tài khoản thành viên C3 được duyệt để đăng ảnh hoặc video.');
      }
      const id = makeId('mem');
      const cleanEventId = sanitizeFirestoreId(payload.eventId, '12c3-ky-niem-khac');
      const cleanEventSlug = truncateText(payload.eventSlug, 64, 'ky-niem-khac');
      const cleanTags = sanitizeTags(payload.tags, 10);
      const uploadedByName = truncateText(user.displayName, 100, 'Thành viên C3');
      const docPayload = {
        id,
        yearCode: payload.yearCode,
        eventId: cleanEventId,
        eventSlug: cleanEventSlug,
        eventTitle: truncateText(payload.eventTitle, 140, 'Kỷ niệm khác'),
        mediaType: payload.mediaType,
        title: truncateText(payload.title, 160, 'Khoảnh khắc C3'),
        caption: truncateText(payload.caption, 800),
        url: truncateText(payload.url, 1500),
        storagePath: truncateText(payload.storagePath, 500),
        thumbnailUrl: truncateText(payload.thumbnailUrl, 1500),
        thumbnailStoragePath: truncateText(payload.thumbnailStoragePath, 500),
        durationSec: Math.max(0, Number(payload.durationSec ?? 0) || 0),
        tags: cleanTags,
        featuredOnHome: false,
        isYearbookSpread: cleanEventSlug === 'ky-yeu',
        isDemo: false,
        status: 'approved' as const,
        uploadedBy: user.uid,
        uploadedByName,
      };
      try {
        if (isAdmin) {
          await ensureEventDocExists(cleanEventId);
        }
        await setDoc(doc(db, 'media', id), {
          ...docPayload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setFirestoreError(null);
        return docPayload as MediaItem;
      } catch (err) {
        setFirestoreError(formatFirestoreErrorForUi(err));
        handleFirestoreError(err, OperationType.CREATE, `media/${id}`);
      }
    },
    [user, isAuthorized, isAdmin, ensureEventDocExists]
  );

  const submitMemberMedia = useCallback(
    async (
      payload: Omit<MediaSubmission, 'id' | 'submittedBy' | 'submittedByName' | 'status'>
    ) => {
      const matchedEvent = (cloudEvents.length > 0 ? cloudEvents : DEFAULT_EVENTS).find(
        (e) => e.id === payload.eventId
      );
      await publishMemberMedia({
        yearCode: payload.yearCode,
        eventId: payload.eventId,
        eventSlug: payload.eventSlug,
        eventTitle: matchedEvent?.title || payload.eventSlug,
        mediaType: payload.mediaType,
        title: payload.title,
        caption: payload.caption,
        url: payload.url,
        storagePath: payload.storagePath,
        thumbnailUrl: payload.thumbnailUrl,
        tags: payload.tags,
      });
    },
    [cloudEvents, publishMemberMedia]
  );

  const moderateSubmission = useCallback(
    async (
      submission: MediaSubmission,
      decision: 'approved' | 'rejected',
      reviewNote = ''
    ) => {
      if (!user || !isAdmin) {
        throw new Error('Chỉ Quản trị viên C3 mới có quyền duyệt đóng góp.');
      }
      try {
        if (decision === 'approved') {
          await ensureEventDocExists(submission.eventId);
        }
        const batch = writeBatch(db);
        batch.update(doc(db, 'submissions', submission.id), {
          status: decision,
          reviewNote: truncateText(reviewNote, 300),
          updatedAt: serverTimestamp(),
        });

        if (decision === 'approved') {
          const matchedEvent = (cloudEvents.length > 0 ? cloudEvents : DEFAULT_EVENTS).find(
            (e) => e.id === submission.eventId
          );
          const mediaId = makeId('mem');
          batch.set(doc(db, 'media', mediaId), {
            id: mediaId,
            yearCode: submission.yearCode,
            eventId: submission.eventId,
            eventSlug: truncateText(submission.eventSlug, 64, 'ky-yeu'),
            eventTitle: truncateText(matchedEvent?.title || submission.eventSlug, 140),
            mediaType: submission.mediaType,
            title: truncateText(submission.title, 160),
            caption: truncateText(submission.caption, 800),
            url: truncateText(submission.url, 1500),
            storagePath: truncateText(submission.storagePath, 500),
            thumbnailUrl: truncateText(submission.thumbnailUrl, 1500),
            tags: sanitizeTags(submission.tags, 10),
            featuredOnHome: false,
            isYearbookSpread: submission.eventSlug === 'ky-yeu',
            isDemo: false,
            status: 'approved',
            uploadedBy: submission.submittedBy,
            uploadedByName: truncateText(submission.submittedByName, 100, 'Thành viên C3'),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        await batch.commit();
        setFirestoreError(null);
      } catch (err) {
        setFirestoreError(formatFirestoreErrorForUi(err));
        handleFirestoreError(err, OperationType.WRITE, `submissions/${submission.id}`);
      }
    },
    [user, isAdmin, cloudEvents, ensureEventDocExists]
  );

  const submitRemovalRequest = useCallback(
    async (mediaItem: MediaItem, reason: string) => {
      if (!user || !isAuthorized) {
        throw new Error('Vui lòng đăng nhập tài khoản thành viên C3 được duyệt để gửi yêu cầu gỡ.');
      }
      const id = makeId('rem');
      try {
        await setDoc(doc(db, 'removalRequests', id), {
          id,
          mediaId: mediaItem.id,
          mediaTitle: truncateText(mediaItem.title, 160),
          reason: truncateText(reason, 600),
          requestedBy: user.uid,
          requestedByName: truncateText(user.displayName, 100, 'Thành viên C3'),
          status: 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setFirestoreError(null);
      } catch (err) {
        setFirestoreError(formatFirestoreErrorForUi(err));
        handleFirestoreError(err, OperationType.CREATE, `removalRequests/${id}`);
      }
    },
    [user, isAuthorized]
  );

  const resolveRemovalRequest = useCallback(
    async (
      reqItem: RemovalRequest,
      decision: 'resolved' | 'dismissed',
      adminNote = ''
    ) => {
      if (!user || !isAdmin) {
        throw new Error('Chỉ Quản trị viên C3 mới có quyền xử lý yêu cầu gỡ.');
      }
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'removalRequests', reqItem.id), {
          status: decision,
          adminNote: truncateText(adminNote, 300),
          updatedAt: serverTimestamp(),
        });
        if (decision === 'resolved') {
          batch.update(doc(db, 'media', reqItem.mediaId), {
            status: 'removed',
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
        setFirestoreError(null);
      } catch (err) {
        setFirestoreError(formatFirestoreErrorForUi(err));
        handleFirestoreError(err, OperationType.WRITE, `removalRequests/${reqItem.id}`);
      }
    },
    [user, isAdmin]
  );

  const updateUserRole = useCallback(
    async (uid: string, role: 'admin' | 'member' | 'pending') => {
      if (!user || !isAdmin) {
        throw new Error('Chỉ Quản trị viên C3 mới có quyền phân quyền tài khoản.');
      }
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'users', uid), {
          role,
          updatedAt: serverTimestamp(),
        });
        if (role === 'admin') {
          batch.set(doc(db, 'admins', uid), {
            uid,
            grantedBy: user.uid,
            createdAt: serverTimestamp(),
          });
        } else if (uid !== user.uid) {
          batch.delete(doc(db, 'admins', uid));
        }
        await batch.commit();
        setFirestoreError(null);
      } catch (err) {
        setFirestoreError(formatFirestoreErrorForUi(err));
        handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
      }
    },
    [user, isAdmin]
  );

  // Merge cloud data with clearly labeled DEMO showcase when authorized has empty media or guest preview is active
  const events = useMemo(() => {
    if (isAuthorized && cloudEvents.length > 0) {
      const existingIds = new Set(cloudEvents.map((ev) => ev.id));
      const missingOtherEvents = DEFAULT_EVENTS.filter(
        (ev) => ev.slug === 'ky-niem-khac' && !existingIds.has(ev.id)
      );
      if (missingOtherEvents.length === 0) return cloudEvents;
      return [...cloudEvents, ...missingOtherEvents].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0)
      );
    }
    if (demoPreviewActive || isAuthorized) return DEFAULT_EVENTS;
    return [];
  }, [isAuthorized, cloudEvents, demoPreviewActive]);

  const media = useMemo(() => {
    if (isAuthorized) {
      return cloudMedia.length > 0 ? cloudMedia : DEMO_MEDIA_ITEMS;
    }
    return demoPreviewActive ? DEMO_MEDIA_ITEMS : [];
  }, [isAuthorized, cloudMedia, demoPreviewActive]);

  const seats = useMemo(() => {
    if (isAuthorized && cloudSeats.length > 0) return cloudSeats;
    if (demoPreviewActive || isAuthorized) return DEFAULT_SEATS;
    return [];
  }, [isAuthorized, cloudSeats, demoPreviewActive]);

  const guestbook = useMemo(() => {
    if (isAuthorized && cloudGuestbook.length > 0) return cloudGuestbook;
    if (demoPreviewActive || isAuthorized) return DEFAULT_GUESTBOOK_DEMO;
    return [];
  }, [isAuthorized, cloudGuestbook, demoPreviewActive]);

  const exportBackupJson = useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      siteConfig,
      events,
      media,
      seats,
      guestbook,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `c3-digital-memory-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [siteConfig, events, media, seats, guestbook]);

  const value: ArchiveContextValue = {
    route,
    navigate,
    user,
    authReady,
    userRole,
    isAuthorized,
    isAdmin,
    demoPreviewActive,
    setDemoPreviewActive,
    signInWithGoogle,
    logout,
    authError,
    firestoreError,
    dismissFirestoreError,
    siteConfig,
    events,
    media,
    seats,
    guestbook,
    usersDirectory,
    submissions,
    removalRequests,
    hasCloudEvents: cloudEvents.length > 0,
    hasCloudSeats: cloudSeats.length > 0,
    updateSiteConfig,
    seedInitialArchiveToFirestore,
    saveEvent,
    deleteEvent,
    saveMediaItem,
    deleteMediaItem,
    saveSeat,
    swapSeats,
    addGuestbookNote,
    deleteGuestbookNote,
    publishMemberMedia,
    submitMemberMedia,
    moderateSubmission,
    submitRemovalRequest,
    resolveRemovalRequest,
    updateUserRole,
    exportBackupJson,
  };

  return <ArchiveContext.Provider value={value}>{children}</ArchiveContext.Provider>;
};

export function useArchive(): ArchiveContextValue {
  const ctx = useContext(ArchiveContext);
  if (!ctx) {
    throw new Error('useArchive must be used inside ArchiveProvider');
  }
  return ctx;
}
