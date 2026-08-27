export function publicCreatorProfile(profile) {
  if (!profile) return null;
  const { password_hash, email, ...publicFields } = profile;
  return publicFields;
}
