import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';

import type {
  CreateUserInput,
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
      status: 'pending_verify',
      fullName: input.fullName,
      phone: input.phone ?? null,
      country: input.country,
      emailVerifiedAt: null,
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
}
