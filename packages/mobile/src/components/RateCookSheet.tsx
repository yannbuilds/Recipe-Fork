import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
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
  /** Recipe to automatically favourite after a perfect score. */
  recipeId: string | null;
  recipeTitle?: string;
  onAutoFavourite?: () => void;
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

type SaveNotice = 'favourited' | 'rating-error' | 'favourite-error' | null;

export default function RateCookSheet({
  open,
  cookId,
  recipeId,
  recipeTitle,
  onAutoFavourite,
  onClose,
}: Props) {
  const t = useTheme();
  const [ratings, setRatings] = useState<Record<AspectKey, number>>({ taste: 0, ease: 0, value: 0 });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<SaveNotice>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      setRatings({ taste: 0, ease: 0, value: 0 });
      setNotice(null);
      setSaving(false);
    }
  }, [open]);

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  const hasAny = ratings.taste > 0 || ratings.ease > 0 || ratings.value > 0;

  async function handleSave() {
    if (!cookId || !hasAny) {
      onClose();
      return;
    }
    setSaving(true);
    setNotice(null);
    const { error: ratingError } = await supabase
      .from('recipe_cooks')
      .update({
        rating_taste: ratings.taste || null,
        rating_ease: ratings.ease || null,
        rating_value: ratings.value || null,
      })
      .eq('id', cookId);

    if (ratingError) {
      setSaving(false);
      setNotice('rating-error');
      haptics.error();
      return;
    }

    const isPerfectScore = ratings.taste === 5 && ratings.ease === 5 && ratings.value === 5;
    if (isPerfectScore && recipeId) {
      const { error: favouriteError } = await supabase
        .from('recipes')
        .update({ is_favourite: true })
        .eq('id', recipeId);

      if (favouriteError) {
        setSaving(false);
        setNotice('favourite-error');
        haptics.error();
        return;
      }

      onAutoFavourite?.();
      setSaving(false);
      setNotice('favourited');
      haptics.success();
      closeTimerRef.current = setTimeout(onClose, 1500);
      return;
    }

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
                onChange={(v) => {
                  setNotice(null);
                  setRatings((prev) => ({ ...prev, [a.key]: v }));
                }}
              />
            </View>
          ))}
        </View>

        {notice ? (
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginTop: 24,
              paddingHorizontal: 14,
              paddingVertical: 11,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: notice === 'favourited' ? t.green : t.red,
              backgroundColor: notice === 'favourited' ? t.greenLight : t.card,
            }}
          >
            <Ionicons
              name={notice === 'favourited' ? 'heart' : 'alert-circle'}
              size={17}
              color={notice === 'favourited' ? t.green : t.red}
            />
            <Body
              size={13}
              weight="semi"
              color={notice === 'favourited' ? t.green : t.red}
              style={{ flex: 1 }}
            >
              {notice === 'favourited'
                ? 'Perfect score — added to favourites'
                : notice === 'rating-error'
                  ? 'Couldn’t save your rating — try again'
                  : 'Rating saved, but the favourite didn’t — try again'}
            </Body>
          </View>
        ) : null}

        {notice !== 'favourited' ? (
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
        ) : null}
      </View>
    </BottomSheet>
  );
}
