import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';

import type {
  CreateUserInput,
  ListUsersQuery,
  ListUsersResult,
  UpdateUserInput,
  User,
  UsersRepository,
} from '../users.repository';

@Injectable()
export class InMemoryUsersRepository implements UsersRepository {
  private readonly store = new Map<string, User>();

  async findByEmail(email: string): Promise<User | null> {
    const normalized = email.toLowerCase();
    return (
      Array.from(this.store.values()).find((u) => u.email === normalized) ?? null
    );
  }

  async findById(id: string): Promise<User | null> {
    return this.store.get(id) ?? null;
  }

  async insert(input: CreateUserInput): Promise<User> {
    const now = new Date();
    const user: User = {
      id: randomUUID(),
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      role: input.role,
      status: input.status ?? 'pending_verify',
      fullName: input.fullName,
      phone: input.phone ?? null,
      country: input.country,
      emailVerifiedAt: input.emailVerifiedAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(user.id, user);
    return user;
  }

  async update(id: string, patch: UpdateUserInput): Promise<User> {
    const existing = this.store.get(id);
    if (!existing) {
      throw new NotFoundException('User không tồn tại');
    }
    const updated: User = {
      ...existing,
      ...patch,
      updatedAt: new Date(),
    };
    this.store.set(id, updated);
    return updated;
  }

  async list(query: ListUsersQuery): Promise<ListUsersResult> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const q = query.q?.trim().toLowerCase();

    const filtered = Array.from(this.store.values())
      .filter((u) => (query.role ? u.role === query.role : true))
      .filter((u) => (query.status ? u.status === query.status : true))
      .filter((u) =>
        q
          ? u.email.toLowerCase().includes(q) ||
            u.fullName.toLowerCase().includes(q)
          : true,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return {
      items: filtered.slice(offset, offset + limit),
      total: filtered.length,
    };
  }

  async delete(id: string): Promise<void> {
    if (!this.store.has(id)) {
      throw new NotFoundException('User không tồn tại');
    }
    this.store.delete(id);
  }
}
