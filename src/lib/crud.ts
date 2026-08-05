import { supabase, isForeignKeyViolation, isUniqueViolation } from './supabase';

/** Tables that go through the shared delete guard. */
export type DeletableTable =
  | 'location'
  | 'asset_type'
  | 'asset'
  | 'inspection'
  | 'inspection_activity'
  | 'incident'
  | 'incident_type'
  | 'grading';

export class NotPermittedError extends Error {
  constructor(message = 'You do not have permission to do that, or the record no longer exists.') {
    super(message);
    this.name = 'NotPermittedError';
  }
}

export class DuplicateNameError extends Error {
  constructor(message = 'That name is already in use.') {
    super(message);
    this.name = 'DuplicateNameError';
  }
}

export class StillReferencedError extends Error {
  constructor(message = 'This record is still in use elsewhere and cannot be deleted.') {
    super(message);
    this.name = 'StillReferencedError';
  }
}

/**
 * Delete a row, and verify something was actually deleted.
 *
 * ⚠️ The most important helper in the app.
 *
 * When RLS blocks a delete, Postgres does NOT raise an error — the row simply
 * isn't visible to the statement, so it reports "0 rows deleted". Through the
 * Supabase client that arrives as { data: [], error: null }: indistinguishable
 * from success.
 *
 * A naive implementation reports "Deleted!" and leaves the row on screen. That
 * is the most likely way an RLS bug reaches a user disguised as a UI bug.
 * Verified against the live database — see README, "What has been verified".
 */
export async function deleteRow(table: DeletableTable, id: string): Promise<void> {
  const { data, error } = await supabase.from(table).delete().eq('id', id).select();

  if (error) {
    if (isForeignKeyViolation(error)) throw new StillReferencedError();
    throw error;
  }
  if (!data || data.length === 0) throw new NotPermittedError();
}

/** Translate a Postgres unique violation into something a person can read. */
export function rethrowSaveError(error: unknown): never {
  if (isUniqueViolation(error)) throw new DuplicateNameError();
  throw error;
}
