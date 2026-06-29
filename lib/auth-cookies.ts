export function setAuthCookie(accessToken: string, expiresIn = 3600) {
  document.cookie = `bb_access_token=${accessToken}; path=/; max-age=${expiresIn}; SameSite=Lax`;
}

export function clearAuthCookie() {
  document.cookie = 'bb_access_token=; path=/; max-age=0';
}
