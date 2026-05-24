export const COURSE_REPOSITORY = Symbol('COURSE_REPOSITORY');

export const COURSE_STATUSES = [
  'draft',
  'pending_approval',
  'published',
  'rejected',
  'archived',
] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];
