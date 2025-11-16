CREATE UNIQUE INDEX "TrustedDevices_user_id_device_fingerprint_key"
  ON "TrustedDevices"("user_id", "device_fingerprint");

