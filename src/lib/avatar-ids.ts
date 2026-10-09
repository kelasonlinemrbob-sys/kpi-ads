/** Avatar choices (see src/avatar). Kept apart from the zod schema so the picker doesn't ship zod to the browser. */
export const AVATAR_IDS = Array.from({ length: 48 }, (_, index) => index + 1);
