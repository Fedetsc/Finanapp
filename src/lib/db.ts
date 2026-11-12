console.log("DATABASE_URL QUE ESTA USANDO PRISMA:", process.env.DATABASE_URL?.split("@")[1]);
import { PrismaClient } from "@prisma/client";
const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? (g.prisma = new PrismaClient());
