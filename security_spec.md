# NOVA Firestore Security Specification

## 1. Data Invariants
1. Every document under `/users/{userId}` and its subcollections (`chats`, `messages`, `imageJobs`, `downloadJobs`, `animeBookmarks`) belongs exclusively to `{userId}` (`request.auth.uid == userId`) with verified email (`request.auth.token.email_verified == true`) for writes.
2. Parent-child relationship integrity: every `ChatMessage` under `/users/{userId}/chats/{chatId}/messages/{messageId}` requires the parent `/users/{userId}/chats/{chatId}` document to exist (`exists(...)`), and `data.chatId == chatId` and `data.userId == userId`.
3. Strict schema validation: every `create` validates both `hasAll` and `hasOnly`, and every `update` validates `isValid[Entity](incoming())` plus `affectedKeys().hasOnly(...)`.
4. Immutable ownership & temporal integrity: `userId` and `createdAt` cannot be modified after creation, and `createdAt`/`updatedAt` must equal `request.time`.
5. Terminal state locking: `ImageJob` records with `status` in `['completed', 'failed']` cannot be updated subsequently.
6. Size bounds on all strings (`<= maxLength`) and valid ID regex (`^[a-zA-Z0-9_\-]+$`) on all path parameters.

## 2. The Dirty Dozen Payloads
1. **Unauthenticated Write**: Creating `/users/u1/chats/c1` without `request.auth` -> DENIED.
2. **Unverified Email Write**: Creating `/users/u1` with `email_verified: false` -> DENIED.
3. **Cross-User Read/List**: User `u2` listing `/users/u1/chats` -> DENIED.
4. **UID Spoofing on Create**: User `u1` creating `/users/u1/chats/c1` with `userId: "u2"` -> DENIED.
5. **Shadow Field Injection**: Creating `/users/u1` with extra key `isAdmin: true` -> DENIED.
6. **ID Poisoning**: Creating `/users/u1/chats/invalid$id!` -> DENIED.
7. **Orphaned Message**: Creating `/users/u1/chats/nonexistent/messages/m1` -> DENIED (`exists` parent check fails).
8. **Client Timestamp Forgery**: Creating `/users/u1/chats/c1` with backdated `createdAt` != `request.time` -> DENIED.
9. **Immutable Ownership Mutation**: Updating `/users/u1/chats/c1` changing `userId` -> DENIED.
10. **Terminal State Bypass**: Updating `/users/u1/imageJobs/j1` from `completed` back to `processing` -> DENIED.
11. **Oversized String Exhaustion**: Creating `/users/u1/chats/c1/messages/m1` with `content` > 32,000 chars -> DENIED.
12. **Role/Status Type Poisoning**: Updating `/users/u1/imageJobs/j1` with `status: 123` or invalid enum value -> DENIED.
