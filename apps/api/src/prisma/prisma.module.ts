import { Global, Module } from '@nestjs/common';

// Phase scaffold: chưa có Prisma schema / PrismaService.
// Sẽ bổ sung PrismaService + schema ở issue Prisma (Section 5+).
@Global()
@Module({})
export class PrismaModule {}
