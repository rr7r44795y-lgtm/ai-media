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
    created_at: new Date().toISOString(),
  };

  const { error } = await supabaseService.from('oauth_states').insert(record);
  if (error) {
    throw new Error('Unable to create OAuth state');
  }
  return record;
}

export async function consumeOAuthState(state: string): Promise<OAuthStateRow> {
  const { data, error } = await supabaseService
    .from('oauth_states')
    .select('*')
    .eq('state', state)
    .maybeSingle();

  if (error || !data) {
    throw new Error('invalid_state');
  }

  const createdAt = data.created_at ? new Date(data.created_at) : null;
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  if (createdAt && createdAt < tenMinutesAgo) {
    await supabaseService.from('oauth_states').delete().eq('state', state);
    throw new Error('invalid_state');
  }

  const { error: deleteError } = await supabaseService.from('oauth_states').delete().eq('state', state);
  if (deleteError) {
    throw new Error('invalid_state');
  }

  return data as OAuthStateRow;
}
