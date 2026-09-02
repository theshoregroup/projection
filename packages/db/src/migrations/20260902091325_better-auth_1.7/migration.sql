ALTER TABLE "account" RENAME COLUMN "provider_account_id" TO "account_id";--> statement-breakpoint
ALTER INDEX "account_issuer_providerAccountId_uidx" RENAME TO "account_issuer_accountId_uidx";