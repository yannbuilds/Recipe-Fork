import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
async function main() {
  const supa = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await supa.from('recipes')
    .update({ video_url: 'https://www.youtube.com/watch?v=yb7TE99Kh8I' })
    .eq('user_id', 'aa767476-981d-4c0e-9345-937c83ad31cd')
    .eq('source_url', 'https://www.recipetineats.com/chicken-chasseur')
    .select('title,video_url');
  if (error) throw error;
  console.log(data);
}
main();
