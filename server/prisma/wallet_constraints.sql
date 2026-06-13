ALTER TABLE "Wallet"
  ADD CONSTRAINT "wallet_available_balance_non_negative"
    CHECK ("availableBalance" >= 0);

ALTER TABLE "Wallet"
  ADD CONSTRAINT "wallet_reserved_balance_non_negative"
    CHECK ("reservedBalance" >= 0);