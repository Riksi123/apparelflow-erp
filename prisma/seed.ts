import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const recipes = [
  {
    recipeCode: "REC-BL01",
    name: "Casual Blouse",
    category: "Blouse",
    standardFabricYards: "1.8",
    wastageCap: "5.0",
    components: [
      ["Front Body Panel", 1],
      ["Back Body Panel", 1],
      ["Sleeves (Left & Right)", 2],
      ["Collar & Stand", 1],
      ["Sleeve Cuffs", 2],
    ] as const,
  },
  {
    recipeCode: "REC-CT02",
    name: "Crop Top",
    category: "Crop Top",
    standardFabricYards: "1.1",
    wastageCap: "8.0",
    components: [
      ["Front Chest Panel", 1],
      ["Back Support Panel", 1],
      ["Neck Binding Strip", 1],
      ["Hem Elastic Casing", 1],
      ["Side Strap Accents", 2],
    ] as const,
  },
];

async function main() {
  for (const recipe of recipes) {
    const { components, ...recipeData } = recipe;
    const storedRecipe = await prisma.recipe.upsert({
      where: { recipeCode: recipe.recipeCode },
      update: recipeData,
      create: recipeData,
    });

    for (const [componentName, piecesPerGarment] of components) {
      await prisma.recipeComponent.upsert({
        where: { recipeId_componentName: { recipeId: storedRecipe.id, componentName } },
        update: { piecesPerGarment },
        create: { recipeId: storedRecipe.id, componentName, piecesPerGarment },
      });
    }
  }

  const demoPassword = process.env.DEMO_PASSWORD;
  if (demoPassword && demoPassword.length >= 12) {
    const passwordHash = await hash(demoPassword, 12);
    const demoUsers = [
      { email: "cutting.supervisor@apparelflow.local", fullName: "Casey Morgan", role: "CUTTING_SUPERVISOR" as const },
      { email: "cutting.verifier@apparelflow.local", fullName: "Riley Chen", role: "CUTTING_VERIFIER" as const },
      { email: "sewing.supervisor@apparelflow.local", fullName: "Jordan Silva", role: "SEWING_SUPERVISOR" as const },
    ];

    for (const user of demoUsers) {
      await prisma.user.upsert({
        where: { email: user.email },
        update: { fullName: user.fullName, role: user.role, passwordHash },
        create: { ...user, passwordHash },
      });
    }
  } else {
    console.info("Skipping demo-user seed: set DEMO_PASSWORD to a value at least 12 characters long.");
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
