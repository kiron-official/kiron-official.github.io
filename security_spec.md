# Security Specification & Payload TDD

## 1. Data Invariants
1. **Default-Deny Catch-All**: Every path not explicitly matched is denied for all reads and writes.
2. **Passcode-Proofed Admin Mutations**: Creating, updating, or soft-deleting `site/public`, `posts`, `photos`, `videos`, `apks`, or soft-deleting comments requires either a valid verified admin account OR a valid cryptographic SHA-256 `authProof` bound to the specific document ID and action (`sha256(passcode + ':' + docId)` or `sha256(passcode + ':' + docId + ':delete')`).
3. **Hard-Delete Prevention**: `allow delete: if false;` prevents unauthenticated direct `DELETE` requests from wiping documents.
4. **No Self-Promotion**: Client SDKs can never create, update, or delete documents in `/admins/{uid}`.
5. **Public Read Scope**: This is a public personal website; `site/public`, `posts`, `posts/{postId}/comments`, `photos`, `videos`, and `apks` contain only intentionally published public content (zero private PII).
6. **Strict Schema & Size Guards**: Every document uses strict key allowlists (`hasAll` + `hasOnly`), `isValidId` regex (`^[a-zA-Z0-9_\-]+$`, max 128 chars), strict type checks, string length bounds, and server timestamp checks (`request.time`).
7. **Parent Integrity for Comments**: Comments under `/posts/{postId}/comments/{commentId}` can only be created if the parent post `/posts/{postId}` exists and is not deleted, cannot include shadow keys, and cannot be forged with `deleted: true`.

## 2. The "Dirty Dozen" Adversarial Payloads (Expected: PERMISSION_DENIED)
1. **Shadow Field Injection on Post**: Write to `/posts/p1` with extra key `{ ..., "isVerified": true }`.
2. **Missing/Forged Admin Proof**: Write to `/posts/p1` with wrong `authProof` string.
3. **Proof Replay Across IDs**: Reuse `authProof` from `/posts/p1` when creating `/posts/p2`.
4. **Post ID Poisoning**: Write to `/posts/bad..id$123` or ID > 128 characters.
5. **Mismatched Document ID**: Create `/posts/post-1` with payload `{ "id": "post-2", ... }`.
6. **Invalid Category Enum**: Create `/posts/post-1` with `{ ..., "cat": "AdminHack" }`.
7. **Server Timestamp Forgery**: Create `/posts/post-1` with client-supplied `createdServerAt` not equal to `request.time`.
8. **Immortal Field Tampering**: Update `/posts/post-1` changing `createdServerAt` or `id`.
9. **Orphan Comment Injection**: Create `/posts/nonexistent-post/comments/c1` where parent post does not exist.
10. **Oversized Comment Spam**: Create `/posts/p1/comments/c1` with 2,500-char `text` (> 1000 maxLength) or empty `text`.
11. **Unauthorized Comment Deletion**: Visitor attempts soft-delete on `/posts/p1/comments/c1` without valid delete `authProof`.
12. **Site Profile Deletion / Admin Escalation**: Attempt `delete` on `/site/public` or `create` on `/admins/{uid}`.
