import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';

import type {
  CreateVerifyTokenInput,
  EmailVerifyToken,
  VerifyTokenRepository,
} from '../auth.repository';

@Injectable()
export class InMemoryVerifyTokenRepository implements VerifyTokenRepository {
  private readonly store = new Map<string, EmailVerifyToken>();

  async create(input: CreateVerifyTokenInput): Promise<EmailVerifyToken> {
    const token: EmailVerifyToken = {
      id: randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
      createdAt: new Date(),
    };
    this.store.set(token.id, token);
    return token;
  }

  async findValid(
    tokenHash: string,
    now: Date,
  ): Promise<EmailVerifyToken | null> {
    return (
      Array.from(this.store.values()).find(
        (t) =>
          t.tokenHash === tokenHash &&
          t.usedAt === null &&
          t.expiresAt > now,
      ) ?? null
    );
  }

  async markUsed(id: string, usedAt: Date): Promise<EmailVerifyToken> {
    const existing = this.store.get(id);
    if (!existing) {
      throw new NotFoundException('Verify token không tồn tại');
    }
    const updated: EmailVerifyToken = { ...existing, usedAt };
    this.store.set(id, updated);
    return updated;
  }

  async invalidateAllForUser(userId: string): Promise<void> {
    const now = new Date();
    for (const [id, token] of this.store) {
      if (token.userId === userId && token.usedAt === null) {
        this.store.set(id, { ...token, usedAt: now });
      }
    }
  }
}
