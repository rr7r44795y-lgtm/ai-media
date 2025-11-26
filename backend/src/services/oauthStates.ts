import { v4 as uuid } from 'uuid';
import { supabaseService } from '../utils/supabaseClient.js';

export interface OAuthStateRow {
  state: string;
  user_id: string;
  redirect_after: string | null;
  created_at?: string;
}

export async function createOAuthState(userId: string, redirectAfter?: string): Promise<OAuthStateRow> {
  const state = uuid();
  const record: OAuthStateRow = {
    state,
    user_id: userId,
    redirect_after: redirectAfter || null,
  };
  const { error } = await supabaseService.from('oauth_states').insert(record);
  if (error) {
    throw new Error('Unable to create OAuth state');
  }
  return record;
}

export async function consumeOAuthState(state: string): Promise<OAuthStateRow | null> {
  const { data, error } = await supabaseService
    .from('oauth_states')
    .delete()
    .eq('state', state)
    .select('*')
    .maybeSingle();
  if (error) return null;
  return (data as OAuthStateRow | null) || null;
}
