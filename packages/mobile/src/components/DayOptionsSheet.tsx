import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import { Body, Button, Mono, Serif } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { DAY_FULL, dayDate } from '@/lib/mealPlanDays';
import { font, useTheme } from '@/lib/theme';

interface Props {
  open: boolean;
  dayIndex: number | null;
  weekStart: Date;
  onCook: () => void;
  onQuickMeal: (name: string) => void;
  onEatingOut: (note: string) => void;
  onClose: () => void;
}

/**
 * The single sheet behind every empty day. Three choices, one of which is
 * deliberately "nothing" — a day you haven't decided on is a valid plan.
 */
export default function DayOptionsSheet({
  open,
  dayIndex,
  weekStart,
  onCook,
  onQuickMeal,
  onEatingOut,
  onClose,
}: Props) {
  const t = useTheme();
  const [mode, setMode] = useState<'menu' | 'quick' | 'out'>('menu');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setMode('menu');
      setNote('');
    }
  }, [open, dayIndex]);

  if (dayIndex === null) return null;

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
          {mode === 'out' ? 'Eating out' : mode === 'quick' ? 'Quick meal' : DAY_FULL[dayIndex]}
        </Serif>
        <Mono size={9.5} style={{ marginTop: 3, letterSpacing: 1.4 }}>
          {(mode === 'menu' ? dateLabel : `${DAY_FULL[dayIndex]} ${dateLabel}`).toUpperCase()}
        </Mono>

        {mode === 'menu' && (
          <View style={{ marginTop: 14 }}>
            {row('restaurant-outline', 'Cook something', 'Pick from your recipes', onCook)}
            {row('flash-outline', 'Quick meal', 'Just give the meal a name', () => setMode('quick'))}
            {row('storefront-outline', 'Eating out', 'Add a note if you like', () => setMode('out'))}
            {row('close-outline', 'Leave it open', 'Decide later — nothing will nag you', onClose)}
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

        {mode === 'quick' && (
          <View style={{ marginTop: 16 }}>
            <Mono size={9.5} style={{ letterSpacing: 1.4, marginBottom: 8 }}>MEAL NAME</Mono>
            <TextInput value={note} onChangeText={setNote} autoFocus returnKeyType="done" onSubmitEditing={() => note.trim() && onQuickMeal(note.trim())} placeholder="Dad's chicken curry, tacos…" placeholderTextColor={t.muted} style={{ borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, color: t.text, fontFamily: font.sans, fontSize: 15, backgroundColor: t.bg }} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <Button label="Back" variant="secondary" onPress={() => setMode('menu')} style={{ flex: 1 }} />
              <Button label="Add meal" disabled={!note.trim()} onPress={() => { haptics.success(); onQuickMeal(note.trim()); }} style={{ flex: 1 }} />
            </View>
          </View>
        )}
      </View>
    </BottomSheet>
  );
}
