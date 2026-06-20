-- AlterTable
ALTER TABLE "Holding" ADD COLUMN "reservedQuantity" INTEGER NOT NULL DEFAULT 0;

-- Add CHECK constraints to Holding
ALTER TABLE "Holding" ADD CONSTRAINT "holding_quantity_non_negative" CHECK ("quantity" >= 0);
ALTER TABLE "Holding" ADD CONSTRAINT "holding_reserved_quantity_non_negative" CHECK ("reservedQuantity" >= 0);
ALTER TABLE "Holding" ADD CONSTRAINT "holding_quantity_gte_reserved" CHECK ("quantity" >= "reservedQuantity");