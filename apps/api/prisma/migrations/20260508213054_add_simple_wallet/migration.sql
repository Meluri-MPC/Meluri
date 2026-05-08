-- CreateTable
CREATE TABLE "SimpleWallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stxAddress" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'testnet',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimpleWallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SimpleWallet_userId_key" ON "SimpleWallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SimpleWallet_stxAddress_key" ON "SimpleWallet"("stxAddress");

-- CreateIndex
CREATE UNIQUE INDEX "SimpleWallet_publicKey_key" ON "SimpleWallet"("publicKey");
