-- CreateTable
CREATE TABLE "Form" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "templateKey" TEXT,
    "schema" JSONB NOT NULL,
    "desktopStyle" JSONB NOT NULL,
    "mobileStyle" JSONB NOT NULL,
    "placement" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "meta" JSONB NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "bucket" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Form_publicId_key" ON "Form"("publicId");

-- CreateIndex
CREATE INDEX "Form_shop_status_idx" ON "Form"("shop", "status");

-- CreateIndex
CREATE INDEX "Form_shop_updatedAt_idx" ON "Form"("shop", "updatedAt");

-- CreateIndex
CREATE INDEX "Submission_shop_formId_createdAt_idx" ON "Submission"("shop", "formId", "createdAt");

-- CreateIndex
CREATE INDEX "Submission_shop_isRead_createdAt_idx" ON "Submission"("shop", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "RateLimit_bucket_idx" ON "RateLimit"("bucket");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimit_key_bucket_key" ON "RateLimit"("key", "bucket");

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;