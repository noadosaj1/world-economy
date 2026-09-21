/**
 * Form state shared between the onboarding server action and its client form.
 *
 * Kept out of actions.ts because a `"use server"` module may only export
 * async functions; a plain object export throws at runtime.
 */

export type OnboardingState = { error: string | null };

export const emptyOnboardingState: OnboardingState = { error: null };
