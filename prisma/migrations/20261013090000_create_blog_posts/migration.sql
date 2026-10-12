-- CreateTable
CREATE TABLE "BlogPost" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "doc" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "blogId" TEXT,
    "articleId" TEXT,
    "blogHandle" TEXT,
    "articleHandle" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlogPost_shop_updatedAt_idx" ON "BlogPost"("shop", "updatedAt");
