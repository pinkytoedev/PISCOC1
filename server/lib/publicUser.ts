/**
 * Outward-facing user shape.
 *
 * `db.select()` returns every column, including the scrypt password hash. That
 * row used to be handed straight to `res.json`, so `/api/login`, `/api/user`
 * and `/api/users` all published password hashes to the client. Responses build
 * their payload through `toPublicUser` so the hash cannot escape by accident.
 */

import type { User } from '@shared/schema';

export interface PublicUser {
  id: number;
  username: string;
  isAdmin: boolean;
  lastLogin: Date | null;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    lastLogin: user.lastLogin ?? null,
  };
}

export function toPublicUsers(users: User[]): PublicUser[] {
  return users.map(toPublicUser);
}
