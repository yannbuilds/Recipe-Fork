import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import { Body, Button, Eyebrow, Mono, Serif } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

/**
 * Post-cook rating sheet: "How did you find it?" with three separate
 * 1–5 star scales (Taste / Ease / Value). Shown right after a recipe is
 * marked cooked; saving writes onto the recipe_cooks row that logged the
 * cook, skipping keeps the cook logged with no ratings.
 */

const ASPECTS = [
  { key: 'taste', label: 'Taste', hint: 'How good did it taste?' },
  { key: 'ease', label: 'Ease', hint: 'How easy was it to make?' },
  { key: 'value', label: 'Value', hint: 'Worth the cost & effort?' },
] as const;

type AspectKey = (typeof ASPECTS)[number]['key'];

interface Props {
  open: boolean;
  /** id of the recipe_cooks row to attach ratings to */
  cookId: string | null;
  recipeTitle?: string;
  /** Called after save or skip — the cook itself is already logged. */
  onClose: () => void;
}

function StarRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => {
            haptics.select();
            onChange(n === value ? 0 : n);
          }}
          hitSlop={4}
          style={{ padding: 3 }}
        >
          <Ionicons
            name={n <= value ? 'star' : 'star-outline'}
            size={26}
            color={n <= value ? t.orange : t.border}
          />
        </Pressable>
      ))}
    </View>
  );
}

export default function RateCookSheet({ open, cookId, recipeTitle, onClose }: Props) {
  const t = useTheme();
  const [ratings, setRatings] = useState<Record<AspectKey, number>>({ taste: 0, ease: 0, value: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setRatings({ taste: 0, ease: 0, value: 0 });
  }, [open]);

  const hasAny = ratings.taste > 0 || ratings.ease > 0 || ratings.value > 0;

  async function handleSave() {
    if (!cookId || !hasAny) {
      onClose();
      return;
    }
    setSaving(true);
    await supabase
      .from('recipe_cooks')
      .update({
        rating_taste: ratings.taste || null,
        rating_ease: ratings.ease || null,
        rating_value: ratings.value || null,
      })
      .eq('id', cookId);
    setSaving(false);
    haptics.success();
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
        <Eyebrow>Cooked · nice one</Eyebrow>
        <Serif size={26} style={{ marginTop: 10 }}>
          How did you find it?
        </Serif>
        {recipeTitle ? (
          <Body size={13} color={t.muted} style={{ marginTop: 4 }}>
            {recipeTitle}
          </Body>
        ) : null}

        <View style={{ marginTop: 20, gap: 16 }}>
          {ASPECTS.map((a) => (
            <View
              key={a.key}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
            >
              <View style={{ flexShrink: 1 }}>
                <Mono size={10} color={t.text} style={{ letterSpacing: 1 }}>
                  {a.label.toUpperCase()}
                </Mono>
                <Body size={12} color={t.muted} style={{ marginTop: 2 }}>
                  {a.hint}
                </Body>
              </View>
              <StarRow
                value={ratings[a.key]}
                onChange={(v) => setRatings((prev) => ({ ...prev, [a.key]: v }))}
              />
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 24 }}>
          <View style={{ flex: 1 }}>
            <Button label="Skip" variant="secondary" full onPress={onClose} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={saving ? 'Saving…' : 'Save rating'}
              variant="filled"
              full
              disabled={!hasAny || saving}
              onPress={handleSave}
            />
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}
