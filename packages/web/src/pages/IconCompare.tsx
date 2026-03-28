import { HugeiconsIcon } from '@hugeicons/react';
import {
  WheatIcon,
  // sugar - no direct icon
  // butter - no direct icon
  EggIcon,
  MilkBottleIcon,
  // salt - no direct icon
  // pepper - no direct icon
  // garlic - no direct icon
  // onion - no direct icon
  // olive oil - no direct icon
  // water - no direct icon (DropletIcon maybe)
  // lemon - no direct icon
  // tomato - no direct icon
  CheeseIcon,
  NoodlesIcon,
  ChickenThighsIcon,
  SteakIcon,
  FishFoodIcon,
  RiceBowl01Icon,
  // potato - no direct icon
  CarrotIcon,
  // spinach - no direct icon
  Mushroom01Icon,
  Honey01Icon,
  IceCream01Icon,
  DrinkIcon,
  // stock - no direct icon
  Bread01Icon,
  // bacon - no direct icon
  AvocadoIcon,
  CornIcon,
  CoffeeBeansIcon,
  NutIcon,
  ApplePieIcon,
} from '@hugeicons/core-free-icons';
import { INGREDIENT_EMOJI_MAP, getIngredientEmoji } from '../utils/ingredientEmojis';

// All ingredients we want to compare — mix of mapped, poorly mapped, and unmapped
const INGREDIENTS = [
  // Well-mapped emojis
  'garlic', 'onion', 'carrot', 'mushroom', 'egg', 'cheese', 'lemon', 'bread',
  'chicken', 'fish', 'rice', 'pasta', 'honey', 'milk', 'flour', 'tomato',
  // Mediocre/reused emojis
  'beef', 'pork', 'cream', 'stock', 'bacon', 'olive oil', 'butter',
  // No emoji match (fallback 🥘)
  'cumin', 'thyme', 'soy sauce', 'paprika', 'cinnamon', 'avocado', 'corn',
  // Produce
  'potato', 'broccoli', 'spinach', 'celery', 'ginger', 'chilli', 'cucumber',
  'capsicum', 'zucchini', 'peas', 'sweet potato', 'lime', 'orange', 'apple',
  'banana', 'coconut',
  // Proteins & dairy
  'lamb', 'prawns', 'tofu', 'yoghurt', 'parmesan',
  // Pantry & spices
  'sugar', 'salt', 'pepper', 'vinegar', 'sesame oil', 'mustard',
  'oregano', 'basil', 'rosemary', 'bay leaves', 'nutmeg', 'turmeric',
  'chilli flakes', 'vanilla',
  // Other
  'chocolate', 'wine', 'coconut milk',
];

// Hugeicons mapping — only icons that exist in the free set
const HUGEICON_MAP: Record<string, typeof WheatIcon | null> = {
  flour: WheatIcon,
  egg: EggIcon,
  milk: MilkBottleIcon,
  cheese: CheeseIcon,
  pasta: NoodlesIcon,
  chicken: ChickenThighsIcon,
  beef: SteakIcon,
  pork: SteakIcon,
  fish: FishFoodIcon,
  rice: RiceBowl01Icon,
  carrot: CarrotIcon,
  mushroom: Mushroom01Icon,
  honey: Honey01Icon,
  cream: IceCream01Icon,
  bread: Bread01Icon,
  avocado: AvocadoIcon,
  corn: CornIcon,
  // No match for: garlic, onion, lemon, tomato, stock, bacon, olive oil,
  // butter, cumin, thyme, soy sauce, paprika, cinnamon, wine
};

// Spoonacular CDN image filenames
const SPOONACULAR_MAP: Record<string, string> = {
  garlic: 'garlic.png',
  onion: 'brown-onion.png',
  carrot: 'sliced-carrot.png',
  mushroom: 'mushrooms-white.jpg',
  egg: 'egg.png',
  cheese: 'parmesan.jpg',
  lemon: 'lemon.png',
  bread: 'white-bread.jpg',
  chicken: 'whole-chicken.jpg',
  fish: 'salmon.png',
  rice: 'uncooked-white-rice.png',
  pasta: 'spaghetti.jpg',
  honey: 'honey.png',
  milk: 'milk.png',
  flour: 'flour.png',
  tomato: 'tomato.png',
  beef: 'beef-cubes-raw.png',
  pork: 'pork-tenderloin-raw.png',
  cream: 'fluid-cream.jpg',
  stock: 'chicken-broth.png',
  bacon: 'raw-bacon.png',
  'olive oil': 'olive-oil.jpg',
  butter: 'butter-sliced.jpg',
  cumin: 'ground-cumin.jpg',
  thyme: 'thyme.jpg',
  'soy sauce': 'soy-sauce.jpg',
  paprika: 'paprika.jpg',
  cinnamon: 'cinnamon-sticks.jpg',
  avocado: 'avocado.jpg',
  corn: 'corn.png',
  potato: 'potatoes-yukon-gold.png',
  broccoli: 'broccoli.jpg',
  spinach: 'spinach.jpg',
  celery: 'celery.jpg',
  ginger: 'ginger.png',
  chilli: 'red-chili.jpg',
  cucumber: 'cucumber.jpg',
  capsicum: 'red-pepper.jpg',
  zucchini: 'zucchini.jpg',
  peas: 'peas-fresh.jpg',
  'sweet potato': 'sweet-potato.png',
  lime: 'lime.png',
  orange: 'orange.png',
  apple: 'apple.png',
  banana: 'bananas.jpg',
  coconut: 'coconut.jpg',
  lamb: 'lamb-loin-chops.jpg',
  prawns: 'shrimp.png',
  tofu: 'tofu.png',
  yoghurt: 'plain-yogurt.jpg',
  parmesan: 'parmesan.jpg',
  sugar: 'sugar-in-702.png',
  salt: 'salt.jpg',
  pepper: 'pepper.jpg',
  vinegar: 'vinegar-(white).jpg',
  'sesame oil': 'sesame-oil.png',
  mustard: 'dijon-mustard.jpg',
  oregano: 'oregano.jpg',
  basil: 'basil.jpg',
  rosemary: 'rosemary.jpg',
  'bay leaves': 'bay-leaves.jpg',
  nutmeg: 'nutmeg.jpg',
  turmeric: 'turmeric.jpg',
  'chilli flakes': 'red-pepper-flakes.jpg',
  vanilla: 'vanilla-extract.jpg',
  chocolate: 'dark-chocolate.jpg',
  wine: 'red-wine.jpg',
  'coconut milk': 'coconut-milk.png',
};

// TheMealDB CDN image names (capitalised)
const MEALDB_MAP: Record<string, string> = {
  garlic: 'Garlic',
  onion: 'Onion',
  carrot: 'Carrots',
  mushroom: 'Mushrooms',
  egg: 'Egg',
  cheese: 'Cheese',
  lemon: 'Lemon',
  bread: 'Bread',
  chicken: 'Chicken',
  fish: 'Salmon',
  rice: 'Rice',
  pasta: 'Penne Rigatoni',
  honey: 'Honey',
  milk: 'Milk',
  flour: 'Plain Flour',
  tomato: 'Tomatoes',
  beef: 'Beef',
  pork: 'Pork',
  cream: 'Double Cream',
  stock: 'Vegetable Stock',
  bacon: 'Bacon',
  'olive oil': 'Olive Oil',
  butter: 'Butter',
  cumin: 'Cumin',
  thyme: 'Thyme',
  'soy sauce': 'Soy Sauce',
  paprika: 'Paprika',
  cinnamon: 'Cinnamon',
  avocado: 'Avocado',
  corn: 'Corn Flour',
  potato: 'Potatoes',
  broccoli: 'Broccoli',
  spinach: 'Spinach',
  celery: 'Celery',
  ginger: 'Ginger',
  chilli: 'Red Chilli Flakes',
  cucumber: 'Cucumber',
  capsicum: 'Red Pepper',
  zucchini: 'Courgettes',
  peas: 'Peas',
  'sweet potato': 'Sweet Potatoes',
  lime: 'Lime',
  orange: 'Orange',
  apple: 'Apples',
  banana: 'Banana',
  coconut: 'Coconut Cream',
  lamb: 'Lamb',
  prawns: 'King Prawns',
  tofu: 'Tofu',
  yoghurt: 'Natural Yoghurt',
  parmesan: 'Parmesan',
  sugar: 'Sugar',
  salt: 'Salt',
  pepper: 'Pepper',
  vinegar: 'Vinegar',
  'sesame oil': 'Sesame Seed Oil',
  mustard: 'Mustard',
  oregano: 'Oregano',
  basil: 'Basil',
  rosemary: 'Rosemary',
  'bay leaves': 'Bay Leaves',
  nutmeg: 'Nutmeg',
  turmeric: 'Turmeric',
  'chilli flakes': 'Red Chilli Flakes',
  vanilla: 'Vanilla Extract',
  chocolate: 'Dark Chocolate',
  wine: 'Red Wine',
  'coconut milk': 'Coconut Milk',
};

function IconCell({ children, missing }: { children: React.ReactNode; missing?: boolean }) {
  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        background: missing ? 'var(--warm)' : 'var(--green-light)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

export default function IconCompare() {
  return (
    <div style={{ animation: 'fadeUp 0.4s ease' }}>
      <h1 className="rf-heading" style={{ fontSize: 22, marginBottom: 4 }}>
        Ingredient Icon Comparison
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>
        Comparing emojis, Hugeicons (free), Spoonacular photos, and TheMealDB photos side by side.
      </p>

      {/* Header row */}
      <div
        className="sticky top-14 z-10"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 60px 60px 60px 60px',
          gap: 8,
          padding: '12px 0',
          background: 'var(--bg)',
          borderBottom: '1px solid var(--border)',
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Ingredient
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' }}>
          Emoji
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' }}>
          Huge
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' }}>
          Photo
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' }}>
          MealDB
        </div>
      </div>

      {/* Ingredient rows */}
      {INGREDIENTS.map((name) => {
        const emoji = getIngredientEmoji(name);
        const hugeicon = HUGEICON_MAP[name];
        const spoonacularFile = SPOONACULAR_MAP[name];
        const mealdbName = MEALDB_MAP[name];
        const isGenericEmoji = emoji === '🥘';

        return (
          <div
            key={name}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 60px 60px 60px 60px',
              gap: 8,
              alignItems: 'center',
              padding: '6px 0',
              borderBottom: '1px solid var(--border)',
            }}
          >
            {/* Name */}
            <div>
              <span style={{ fontSize: 15, fontWeight: 500, textTransform: 'capitalize' }}>
                {name}
              </span>
              {isGenericEmoji && (
                <span style={{ fontSize: 11, color: 'var(--red)', marginLeft: 6 }}>
                  no match
                </span>
              )}
            </div>

            {/* Emoji */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <IconCell missing={isGenericEmoji}>
                <span style={{ fontSize: 24 }}>{emoji}</span>
              </IconCell>
            </div>

            {/* Hugeicons */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {hugeicon ? (
                <IconCell>
                  <HugeiconsIcon icon={hugeicon} size={26} strokeWidth={1.5} style={{ color: 'var(--green)' }} />
                </IconCell>
              ) : (
                <IconCell missing>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>
                </IconCell>
              )}
            </div>

            {/* Spoonacular */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {spoonacularFile ? (
                <IconCell>
                  <img
                    src={`https://img.spoonacular.com/ingredients_100x100/${spoonacularFile}`}
                    alt={name}
                    style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 6 }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </IconCell>
              ) : (
                <IconCell missing>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>
                </IconCell>
              )}
            </div>

            {/* TheMealDB */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {mealdbName ? (
                <IconCell>
                  <img
                    src={`https://www.themealdb.com/images/ingredients/${encodeURIComponent(mealdbName)}-Small.png`}
                    alt={name}
                    style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 6 }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </IconCell>
              ) : (
                <IconCell missing>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>
                </IconCell>
              )}
            </div>
          </div>
        );
      })}

      {/* Summary */}
      <div className="rf-card" style={{ marginTop: 24, padding: 20 }}>
        <h2 className="rf-heading" style={{ fontSize: 16, marginBottom: 12 }}>Coverage Summary</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
          <SummaryCard
            label="Emojis"
            matched={INGREDIENTS.filter(n => getIngredientEmoji(n) !== '🥘').length}
            total={INGREDIENTS.length}
            note="Limited variety, some reused"
          />
          <SummaryCard
            label="Hugeicons"
            matched={INGREDIENTS.filter(n => !!HUGEICON_MAP[n]).length}
            total={INGREDIENTS.length}
            note="Free tier only"
          />
          <SummaryCard
            label="Spoonacular"
            matched={INGREDIENTS.filter(n => !!SPOONACULAR_MAP[n]).length}
            total={INGREDIENTS.length}
            note="Photos, not icons"
          />
          <SummaryCard
            label="TheMealDB"
            matched={INGREDIENTS.filter(n => !!MEALDB_MAP[n]).length}
            total={INGREDIENTS.length}
            note="CDN photos, no key"
          />
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, matched, total, note }: { label: string; matched: number; total: number; note: string }) {
  const pct = Math.round((matched / total) * 100);
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--green)' }}>
        {matched}/{total}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{pct}% coverage</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{note}</div>
    </div>
  );
}
