export interface EmailVerifyToken {
  id: string;
  userId: string;
  tokenHash: string; // sha256(rawToken) hex
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface CreateVerifyTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface VerifyTokenRepository {
  create(input: CreateVerifyTokenInput): Promise<EmailVerifyToken>;
  findValid(tokenHash: string, now: Date): Promise<EmailVerifyToken | null>;
  markUsed(id: string, usedAt: Date): Promise<EmailVerifyToken>;
  invalidateAllForUser(userId: string): Promise<void>;
}
