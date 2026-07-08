import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, View } from 'react-native';
import { Body } from '@/components/ui';
import type { TagCategory } from '@/lib/tagMeta';
import { font, useTheme } from '@/lib/theme';

const TAB_ICON: Record<TagCategory, keyof typeof Ionicons.glyphMap> = {
  meal: 'restaurant-outline',
  cuisine: 'globe-outline',
  protein: 'nutrition-outline',
  dietary: 'leaf-outline',
  style: 'flame-outline',
};

interface CategoryItem {
  tag: string;
  label: string;
  emoji: string;
}

interface Props {
  activeCategories: Set<string>;
  categoryTab: TagCategory | null;
  setCategoryTab: (value: TagCategory | null) => void;
  visibleCategories: CategoryItem[];
  visibleTabs: { value: TagCategory; label: string; emoji: string }[];
  toggleCategory: (tagName: string) => void;
  tabHasSelection: (tabValue: TagCategory) => boolean;
}

function Chip({
  label,
  active,
  icon,
  onPress,
}: {
  label: string;
  active: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? t.green : t.border,
        backgroundColor: active ? t.greenLight : t.card,
      }}
    >
      {icon && <Ionicons name={icon} size={13} color={active ? t.green : t.muted} />}
      <Body size={12} weight="semi" color={active ? t.green : t.muted} style={{ fontFamily: font.sansSemi }}>
        {label}
      </Body>
    </Pressable>
  );
}

export default function RecipeFilterBar({
  activeCategories,
  categoryTab,
  setCategoryTab,
  visibleCategories,
  visibleTabs,
  toggleCategory,
  tabHasSelection,
}: Props) {
  if (visibleTabs.length === 0) return <View style={{ height: 4 }} />;

  return (
    <View style={{ gap: 10 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}
      >
        {visibleTabs.map((tab) => (
          <Chip
            key={tab.value}
            label={tab.label}
            icon={TAB_ICON[tab.value]}
            active={categoryTab === tab.value || tabHasSelection(tab.value)}
            onPress={() => setCategoryTab(categoryTab === tab.value ? null : tab.value)}
          />
        ))}
      </ScrollView>

      {categoryTab && visibleCategories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}
        >
          {visibleCategories.map((cat) => (
            <Chip
              key={cat.tag}
              label={cat.label}
              active={activeCategories.has(cat.tag)}
              onPress={() => toggleCategory(cat.tag)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
