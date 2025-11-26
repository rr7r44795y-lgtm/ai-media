import { supabaseService } from './supabaseClient.js';

export const createSignedContentLinks = async (contentId: string): Promise<string[]> => {
  const { data: content, error } = await supabaseService
    .from('contents')
    .select('url, bucket, path')
    .eq('id', contentId)
    .maybeSingle();

  if (error || !content) return [];
  if (!content.bucket || !content.path) return [content.url];

  const { data: signed, error: signErr } = await supabaseService.storage
    .from(content.bucket as string)
    .createSignedUrl(content.path as string, 60 * 60 * 6, { download: true, transform: undefined });

  if (signErr || !signed?.signedUrl) return [content.url];
  return [signed.signedUrl];
};
