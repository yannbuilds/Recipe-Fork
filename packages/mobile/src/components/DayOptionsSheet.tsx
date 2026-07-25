import { Ionicons } from '@expo/vector-icons';
import type { MealPlanEntry } from '@recipe-aggregator/shared';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import { Body, Button, Mono, Serif } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { DAY_FULL, batchSiblings, dayDate } from '@/lib/mealPlanDays';
import { font, useTheme } from '@/lib/theme';

interface Props {
  open: boolean;
  dayIndex: number | null;
  weekStart: Date;
  entries: MealPlanEntry[];
  onCook: () => void;
  onAnotherNight: (cookEntryId: string) => void;
  onEatingOut: (note: string) => void;
  onClose: () => void;
}

/**
 * The single sheet behind every empty day. Four choices, one of which is
 * deliberately "nothing" — a day you haven't decided on is a valid plan.
 */
export default function DayOptionsSheet({
  open,
  dayIndex,
  weekStart,
  entries,
  onCook,
  onAnotherNight,
  onEatingOut,
  onClose,
}: Props) {
  const t = useTheme();
  const [mode, setMode] = useState<'menu' | 'nights' | 'out'>('menu');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setMode('menu');
      setNote('');
    }
  }, [open, dayIndex]);

  if (dayIndex === null) return null;

  // Only cooks already in the week can spawn another night, so a meal-prep
  // night can never end up with no pot behind it.
  const cooks = entries.filter((e) => e.entry_type === 'cook' && e.recipe);
  const date = dayDate(weekStart, dayIndex);
  const dateLabel = date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });

  const row = (
    icon: keyof typeof Ionicons.glyphMap,
    title: string,
    detail: string,
    onPress: () => void,
    disabled = false,
  ) => (
    <Pressable
      onPress={() => {
        if (disabled) return;
        haptics.select();
        onPress();
      }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 14,
        borderTopWidth: 1,
        borderTopColor: t.ruleHair,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Ionicons name={icon} size={20} color={disabled ? t.muted : t.green} />
      <View style={{ flex: 1 }}>
        <Serif size={17}>{title}</Serif>
        <Body size={12.5} color={t.muted} style={{ marginTop: 1 }}>
          {detail}
        </Body>
      </View>
    </Pressable>
  );

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View style={{ paddingHorizontal: 20 }}>
        <Serif size={22}>
          {mode === 'nights' ? 'Another night of…' : mode === 'out' ? 'Eating out' : DAY_FULL[dayIndex]}
        </Serif>
        <Mono size={9.5} style={{ marginTop: 3, letterSpacing: 1.4 }}>
          {(mode === 'menu' ? dateLabel : `${DAY_FULL[dayIndex]} ${dateLabel}`).toUpperCase()}
        </Mono>

        {mode === 'menu' && (
          <View style={{ marginTop: 14 }}>
            {row('restaurant-outline', 'Cook something', 'Pick from your recipes', onCook)}
            {row(
              'repeat-outline',
              'Another night of…',
              cooks.length === 0 ? 'Add a meal to the week first' : 'Eat one cook twice — nothing extra to buy',
              () => setMode('nights'),
              cooks.length === 0,
            )}
            {row('storefront-outline', 'Eating out', 'Add a note if you like', () => setMode('out'))}
            {row('close-outline', 'Leave it open', 'Decide later — nothing will nag you', onClose)}
          </View>
        )}

        {mode === 'nights' && (
          <View style={{ marginTop: 14 }}>
            <Body size={13.5} color={t.textSoft} style={{ lineHeight: 20, marginBottom: 8 }}>
              Pick the meal you're stretching. It gets shopped for once and cooked once — this night just eats from
              the same batch.
            </Body>
            <ScrollView style={{ maxHeight: 300 }}>
              {cooks.map((cook) => {
                const nights = batchSiblings(cook, entries).length;
                return (
                  <Pressable
                    key={cook.id}
                    onPress={() => {
                      haptics.success();
                      onAnotherNight(cook.id);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingVertical: 10,
                      borderTopWidth: 1,
                      borderTopColor: t.ruleHair,
                    }}
                  >
                    {cook.recipe?.image_url ? (
                      <Image
                        source={{ uri: cook.recipe.image_url }}
                        style={{ width: 44, height: 44, borderRadius: 4 }}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        recyclingKey={cook.recipe.id}
                      />
                    ) : (
                      <View style={{ width: 44, height: 44, borderRadius: 4, backgroundColor: t.paper3 }} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Serif size={16} numberOfLines={1}>
                        {cook.recipe?.title}
                      </Serif>
                      <Mono size={9.5} style={{ marginTop: 3, letterSpacing: 0.8 }}>
                        {nights > 1 ? `ALREADY ${nights} NIGHTS` : 'ONE NIGHT SO FAR'}
                      </Mono>
                    </View>
                    <Ionicons name="add" size={20} color={t.green} />
                  </Pressable>
                );
              })}
            </ScrollView>
            <Button label="Back" variant="secondary" onPress={() => setMode('menu')} style={{ marginTop: 16 }} full />
          </View>
        )}

        {mode === 'out' && (
          <View style={{ marginTop: 16 }}>
            <Mono size={9.5} style={{ letterSpacing: 1.4, marginBottom: 8 }}>
              WHERE? (OPTIONAL)
            </Mono>
            <TextInput
              value={note}
              onChangeText={setNote}
              autoFocus
              placeholder="Thai place, Mum's, work dinner…"
              placeholderTextColor={t.muted}
              style={{
                borderWidth: 1,
                borderColor: t.border,
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 11,
                color: t.text,
                fontFamily: font.sans,
                fontSize: 15,
                backgroundColor: t.bg,
              }}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <Button label="Back" variant="secondary" onPress={() => setMode('menu')} style={{ flex: 1 }} />
              <Button
                label={`Set for ${DAY_FULL[dayIndex]}`}
                onPress={() => {
                  haptics.success();
                  onEatingOut(note.trim());
                }}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}
      </View>
    </BottomSheet>
  );
}
