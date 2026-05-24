import type { UserRole, UserStatus } from './users.constants';
import type { User } from './users.repository';

/** Public view of a user — never exposes `passwordHash`. */
export interface AdminUserView {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  fullName: string;
  phone: string | null;
  country: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toAdminUserView(u: User): AdminUserView {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    status: u.status,
    fullName: u.fullName,
    phone: u.phone,
    country: u.country,
    emailVerifiedAt: u.emailVerifiedAt,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}
