import { PrismaClient } from "@prisma/client";

const prisma =
  new PrismaClient();

async function main() {
  /*
   * CHANGE THESE DATES when you decide the real launch window.
   *
   * Example:
   * 1 January 2027 -> 31 December 2027
   */
  const startAt =
    new Date(
      "2027-01-01T00:00:00.000Z"
    );

  const endAt =
    new Date(
      "2027-12-31T23:59:59.999Z"
    );

  await prisma.promotionConfig.upsert({
    where: {
      id: "global",
    },

    create: {
      id: "global",
      name:
        "Launch Promotion",
      startAt,
      endAt,
      active: true,
    },

    update: {
      startAt,
      endAt,
      active: true,
    },
  });

  console.log(
    "Global promotion configured:",
    {
      startAt,
      endAt,
    }
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });