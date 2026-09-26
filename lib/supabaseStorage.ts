import { supabase } from './supabase';

// Marketplace images go to Supabase Storage (the buckets the original
// Next.js marketplace already used), not Bunny — unlike Gems/Seeds
// video uploads elsewhere in this app. Storage RLS requires the path's
// first segment to equal auth.uid(), which the userId param enforces.
export async function uploadMarketplaceImage(
  bucket: 'marketplace-product-images' | 'marketplace-seller-images',
  userId: string,
  uri: string,
  mimeType?: string | null
): Promise<string> {
  const ext = (mimeType?.split('/')[1] || uri.split('.').pop() || 'jpg').replace('jpeg', 'jpg');
  const path = `${userId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;

  const blob = await fetch(uri).then(r => r.blob());

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { contentType: mimeType || 'image/jpeg' });

  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
