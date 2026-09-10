const PWA_CACHE_PREFIX = "pi-web-";

interface RegistrationLike {
  unregister(): Promise<boolean>;
}

interface CacheStorageLike {
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
}

interface DevelopmentPwaEnvironment {
  getRegistrations?: () => Promise<readonly RegistrationLike[]>;
  cacheStorage?: CacheStorageLike;
}

export async function clearDevelopmentPwaState({
  getRegistrations,
  cacheStorage,
}: DevelopmentPwaEnvironment): Promise<void> {
  const registrations = getRegistrations ? await getRegistrations() : [];
  await Promise.all(registrations.map((registration) => registration.unregister()));

  if (!cacheStorage) return;
  const cacheNames = await cacheStorage.keys();
  await Promise.all(
    cacheNames
      .filter((name) => name.startsWith(PWA_CACHE_PREFIX))
      .map((name) => cacheStorage.delete(name)),
  );
}
