import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
async function main() {
  const supa = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const urls = [
    'https://www.recipetineats.com/baked-sausage-breakfast-hash',
    'https://www.recipetineats.com/marinated-fish-tacos',
    'https://www.recipetineats.com/pineapple-fried-rice-thai',
    'https://www.recipetineats.com/bok-choy-in-ginger-sauce',
    'https://www.recipetineats.com/korean-beef-bulgogi-rice-bowls-the-easy-way',
    'https://www.recipetineats.com/chicken-chasseur',
    'https://www.recipetineats.com/filipino-pork-adobo',
    'https://www.recipetineats.com/vietnamese-caramel-pork',
  ];
  const userId = 'aa767476-981d-4c0e-9345-937c83ad31cd';
  const { data, error } = await supa.from('recipes').delete().eq('user_id', userId).in('source_url', urls).select('title');
  if (error) throw error;
  console.log('deleted:', data?.map(r => r.title));
}
main();
