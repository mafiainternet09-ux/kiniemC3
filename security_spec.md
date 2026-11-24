# Security Specification — C3 Digital Memory

## 1. Data Invariants
1. **Default-Private Archive**: Unauthenticated users or `pending` users cannot read private class media, events, seats, submissions, or removal requests from Firestore.
2. **No Self-Promoted Admin or Membership**: A standard user registering in `/users/{userId}` can only create their entry with `role: 'pending'` (unless they match the verified bootstrap admin email `mafiainternet09@gmail.com`) and cannot modify their own `role` or write to `/admins/{userId}`.
3. **PII Isolation**: User email addresses reside exclusively in `/users/{userId}/private/profile`, readable only by the owner (`request.auth.uid == userId`) or an Admin.
4. **Immutable Ownership & Timestamps**: `uploadedBy`, `submittedBy`, `requestedBy`, `authorUid`, and `createdAt` cannot be forged or modified after creation; `createdAt` and `updatedAt` must match `request.time`.
5. **Separated & Bounded Media**: `MediaItem` strictly enforces `mediaType in ['image', 'video']`, `yearCode in ['10A3', '11B3', '12C3']`, bounded string lengths, and bounded `tags.size() <= 10`.
6. **Terminal Moderation Locking**: Once a `MediaSubmission` is `'approved'` or `'rejected'`, or a `RemovalRequest` is `'resolved'` or `'dismissed'`, non-admins cannot reopen or alter it.

## 2. Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)
1. Unauthenticated `get` or `list` on `/media` or `/seats`.
2. Unverified-email user attempting `create` on `/guestbook`.
3. Regular member attempting `create` on `/users/{uid}` with `role: 'admin'` or `role: 'member'`.
4. Regular member attempting `update` on `/users/{uid}` changing `role` from `'member'` to `'admin'`.
5. Regular member attempting `create` on `/admins/{uid}` to grant themselves admin privileges.
6. Regular member attempting to read `/users/{otherUid}/private/profile` (PII harvest).
7. Member attempting `create` on `/submissions/{id}` with `submittedBy` set to another user's UID (Identity Spoofing).
8. Member attempting `create` on `/submissions/{id}` with `status: 'approved'` (State Shortcutting).
9. Member attempting `update` on `/submissions/{id}` after it reached `'approved'` (Terminal State Unlocking).
10. Attacker injecting a shadow field (`isVerified: true`) into `/guestbook/{id}` (Shadow Update).
11. Attacker injecting a 2KB junk ID into `/events/{veryLongId}` (ID Poisoning).
12. Attacker forging `createdAt` to a past timestamp instead of `request.time` (Temporal Tampering).
