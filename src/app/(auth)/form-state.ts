/**
 * Form state shared between the auth server actions and the client form.
 *
 * This lives outside actions.ts on purpose. A `"use server"` module may only
 * export async functions - exporting a plain object from one throws at
 * runtime ("A 'use server' file can only export async functions, found
 * object"), which is not caught at build time.
 */

export type AuthFormState = { error: string | null; notice: string | null };

export const emptyAuthState: AuthFormState = { error: null, notice: null };
