// Plain module (no "use server"): a Server Action file may export only async
// functions, so shared constants like this must live outside actions.ts.
export const MAX_SPACES_PER_USER = 5;
