/** Unchecked: browser-session cookie, with a 12-hour server expiry. Checked: 30 days. */
export function sessionPolicy(remember: boolean) {
  return {
    expiresIn: remember ? "30d" : "12h",
    cookie: remember ? { maxAge: 30 * 24 * 60 * 60 } : {},
  };
}
