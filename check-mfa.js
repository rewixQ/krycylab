import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkMFA() {
  try {
    const tokens = await prisma.mFAToken.findMany({
      include: { user: { select: { username: true } } }
    });
    console.log('MFA Tokens in database:', tokens);

    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        mfaTokens: { where: { isActive: true } }
      }
    });
    console.log('Users with active MFA tokens:', users.map(u => ({
      id: u.id,
      username: u.username,
      activeMfaTokens: u.mfaTokens.length
    })));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkMFA();
