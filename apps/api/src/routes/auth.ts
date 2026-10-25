import { PrismaClient } from '@aicte/database';
import bcrypt from 'bcryptjs';
import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['APPLICANT', 'SCRUTINY_OFFICER']),
  institutionId: z.string().uuid().optional(),
});
const LoginSchema = z.object({ email: z.string().email(), password: z.string() });

router.post('/register', async (req: Request, res: Response) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, password, role, institutionId } = parsed.data;
  if (await prisma.user.findUnique({ where: { email } })) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }
  if (institutionId && !(await prisma.institution.findUnique({ where: { id: institutionId } }))) {
    res.status(400).json({ error: 'Institution not found' });
    return;
  }
  const user = await prisma.user.create({
    data: { email, passwordHash: await bcrypt.hash(password, 12), role, institutionId },
    select: { id: true, email: true, role: true, institutionId: true },
  });
  res.status(201).json({ user });
});

router.post('/login', async (req: Request, res: Response) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  const token = jwt.sign(
    { userId: user.id, role: user.role, institutionId: user.institutionId },
    process.env.JWT_SECRET ?? '',
    { expiresIn: '8h' },
  );
  res.json({ token, user: { id: user.id, email: user.email, role: user.role, institutionId: user.institutionId } });
});

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true, role: true, institutionId: true, createdAt: true },
  });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ user });
});

export default router;
