import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import { Body, Mono, Serif } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { getWeekOptions } from '@/lib/weekHelpers';

interface Props {
  open: boolean;
  recipeId: string;
  recipeTitle: string;
  userId: string;
  onClose: () => void;
}

export default function WeekPickerSheet({ open, recipeId, recipeTitle, userId, onClose }: Props) {
  const t = useTheme();
  const [addedWeeks, setAddedWeeks] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from('meal_plan_recipes')
        .select('meal_plan_id, meal_plans!inner(week_start)')
        .eq('recipe_id', recipeId);
      if (data) {
        setAddedWeeks(new Set(data.map((r: any) => r.meal_plans.week_start as string)));
      }
      setLoading(false);
    })();
  }, [open, recipeId]);

  async function toggleWeek(weekStart: string) {
    setBusy(weekStart);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const isAdded = addedWeeks.has(weekStart);

    // Find or create the plan for this week
    const { data: plans } = await supabase
      .from('meal_plans')
      .select('id')
      .eq('week_start', weekStart)
      .order('created_at', { ascending: true });
    let plan = plans?.[0] ?? null;
    if (!plan) {
      const { data: created } = await supabase
        .from('meal_plans')
        .insert({ user_id: userId, week_start: weekStart })
        .select('id')
        .single();
      plan = created;
    }
    if (!plan) {
      setBusy(null);
      return;
    }

    if (isAdded) {
      await supabase
        .from('meal_plan_recipes')
        .delete()
        .eq('meal_plan_id', plan.id)
        .eq('recipe_id', recipeId);
      setAddedWeeks((prev) => {
        const next = new Set(prev);
        next.delete(weekStart);
        return next;
      });
    } else {
      await supabase.from('meal_plan_recipes').insert({ meal_plan_id: plan.id, recipe_id: recipeId });
      setAddedWeeks((prev) => new Set(prev).add(weekStart));
    }
    setBusy(null);
  }

  const weeks = getWeekOptions(4);

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
        <Serif size={18} weight="semi">
          Add to meal plan
        </Serif>
        <Body size={13} color={t.muted} style={{ marginTop: 4 }}>
          Choose a week for {recipeTitle}
        </Body>

        {loading ? (
          <ActivityIndicator style={{ marginVertical: 24 }} color={t.green} />
        ) : (
          <View style={{ gap: 8, marginTop: 14 }}>
            {weeks.map((week) => {
              const isAdded = addedWeeks.has(week.weekStart);
              return (
                <Pressable
                  key={week.weekStart}
                  onPress={() => toggleWeek(week.weekStart)}
                  disabled={busy === week.weekStart}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderRadius: 10,
                    borderWidth: isAdded ? 2 : 1,
                    borderColor: isAdded ? t.green : t.border,
                    backgroundColor: isAdded ? t.greenLight : t.bg,
                  }}
                >
                  {(week.isCurrent || week.isDefault) && (
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 999,
                        backgroundColor: week.isCurrent ? t.warm : t.green,
                      }}
                    >
                      <Mono size={9} color={week.isCurrent ? t.muted : t.onGreen}>
                        {week.isCurrent ? 'THIS WEEK' : 'NEXT WEEK'}
                      </Mono>
                    </View>
                  )}
                  <Body size={14} weight="medium" color={isAdded ? t.green : t.text} style={{ flex: 1 }}>
                    {week.label}
                  </Body>
                  {busy === week.weekStart ? (
                    <ActivityIndicator size="small" color={t.green} />
                  ) : isAdded ? (
                    <Body size={13} weight="semi" color={t.green}>
                      ✓ Added
                    </Body>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </BottomSheet>
  );
}
