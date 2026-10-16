import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const endAt = new Date("2027-12-31T23:59:59.999Z");
  const existing = await prisma.promotionConfig.findUnique({
    where: { id: "global" },
  });

  if (existing) {
    await prisma.promotionConfig.update({
      where: { id: "global" },
      data: {
        active: true,
        endAt,
      },
    });
    console.log("Launch promotion end date enforced:", endAt.toISOString());
  } else {
    await prisma.promotionConfig.create({
      data: {
        id: "global",
        name: "Launch Promotion",
        startAt: new Date(),
        endAt,
        active: true,
      },
    });
    console.log("Launch promotion created through:", endAt.toISOString());
  }
} finally {
  await prisma.$disconnect();
}
