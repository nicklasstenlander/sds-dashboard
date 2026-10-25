// Värdet till XMLHttpRequest.setRequestHeader("Authorization", ...).
// Headers lowercasar namn, så Object.fromEntries(headers.entries()).Authorization
// är alltid undefined. Fetch bryr sig inte (headernamn är skiftlägesokänsliga),
// men XHR-uppladdningen läste just den nyckeln och skickade därför utan session.
// .get() är skiftlägesokänsligt. Saknas headern returneras null; anroparen
// staffAuthHeaders kastar redan om CORE-sessionen saknas.

export function authorizationHeaderValue(headers: Headers): string | null {
  return headers.get("Authorization");
}
