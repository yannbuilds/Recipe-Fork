import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
async function main() {
  const supa = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const titles = ['Baked Sausage Breakfast Hash','Marinated Fish Tacos','Pineapple Fried Rice (Thai)','Bok Choy in Ginger Sauce','Korean Beef Bulgogi Rice Bowls (Easy)','Chicken Chasseur','Filipino Pork Adobo','Vietnamese Caramel Pork'];
  const { data } = await supa.from('recipes').select('title,video_url,author_notes').in('title', titles);
  for (const r of data!) console.log(r.title, '|video:', r.video_url, '|notes:', r.author_notes?.slice(0,60));
}
main();
