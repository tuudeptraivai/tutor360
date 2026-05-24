export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export const USER_ROLES = ['user', 'tutor', 'admin', 'hanah'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['pending_verify', 'active', 'blocked'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
