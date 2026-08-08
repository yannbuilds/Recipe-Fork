import { Ionicons } from '@expo/vector-icons';
import type { Recipe } from '@recipe-aggregator/shared';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RecipeBrowser from '@/components/RecipeBrowser';
import { Body, Button, Mono, Serif } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { DAY_INDEXES, DAY_SHORT, dayDate, planServings, todayIndex } from '@/lib/mealPlanDays';
import { useTheme } from '@/lib/theme';
import useRecipeBrowserData from '@/lib/useRecipeBrowserData';

export interface PlanPrefs {
  /** Cooks in the week — pots on the stove, not nights at the table. */
  meals: number;
  /** People eating one meal. */
  servings: number;
  /** Meals one cook covers, without assigning the later meals to dates. */
  nights: number;
}

export interface PlanPick {
  recipe: Recipe;
  nights: number;
}

/** One cook — the only unit that gets placed on a day. */
interface Slot {
  key: string;
  recipeId: string;
  day: number | null;
}

interface Props {
  open: boolean;
  weekStart: Date;
  takenDays: Set<number>;
  prefs: PlanPrefs | null;
  onSavePrefs: (prefs: PlanPrefs) => void;
  onCommit: (
    picks: PlanPick[],
    slots: { recipeId: string; day: number | null }[],
    servingsPerMeal: number,
  ) => Promise<void>;
  onClose: () => void;
}

/**
 * Plan mode. Asks the setup questions once, remembers the answers, and from
 * then on opens straight at picking. Every step after the first is skippable —
 * you can bail at any point and the meals just land in the week unplaced.
 */
export default function PlanWeekSheet({
  open,
  weekStart,
  takenDays,
  prefs,
  onSavePrefs,
  onCommit,
  onClose,
}: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [meals, setMeals] = useState(3);
  const [servings, setServings] = useState(2);
  const [nights, setNights] = useState(2);
  const [picks, setPicks] = useState<PlanPick[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The collection, its cookbooks and the cooking history — the same data the
  // add-a-recipe picker browses.
  const data = useRecipeBrowserData(open);

  useEffect(() => {
    if (!open) return;
    setStep(prefs ? 2 : 1);
    setMeals(prefs?.meals ?? 3);
    setServings(prefs?.servings ?? 2);
    setNights(prefs?.nights ?? 2);
    setPicks([]);
    setSlots([]);
    setActiveSlot(null);
  }, [open, prefs]);

  const totalMeals = picks.reduce((sum, p) => sum + p.nights, 0);
  // What the setup answers add up to: cooks × meals covered by each batch.
  const plannedMeals = meals * nights;
  // A pick can always be cycled past the default — the answer is a starting
  // point, not a cap.
  const maxNights = Math.max(3, nights);
  const pickedIds = new Set(picks.map((p) => p.recipe.id));

  function togglePick(recipe: Recipe) {
    haptics.select();
    setPicks((prev) => {
      const found = prev.find((p) => p.recipe.id === recipe.id);
      if (found) return prev.filter((p) => p.recipe.id !== recipe.id);
      // Everything starts on the answer from step 1 — most cooks here are meal
      // prep, so 1 meal would mean re-tapping every card.
      return [...prev, { recipe, nights }];
    });
  }

  function cycleNights(recipeId: string) {
    haptics.light();
    setPicks((prev) =>
      prev.map((p) =>
        p.recipe.id === recipeId ? { ...p, nights: p.nights >= maxNights ? 1 : p.nights + 1 } : p,
      ),
    );
  }

  function minutesFor(recipeId: string): number {
    const r = data.recipes.find((x) => x.id === recipeId);
    return (r?.prep_time ?? 0) + (r?.cook_time ?? 0);
  }

  function recipeFor(id: string): Recipe | undefined {
    return data.recipes.find((r) => r.id === id);
  }

  /**
   * What one pick gets shopped for, and whether the recipe — not the maths —
   * set that number. `asWritten` is the case worth labelling: the recipe already
   * makes more than people × meals, so it's planned whole instead of scaled down.
   */
  function servingsFor(pick: PlanPick): { total: number; asWritten: boolean } {
    const total = planServings(pick.recipe, servings, pick.nights);
    return { total, asWritten: total > servings * pick.nights };
  }

  function goToPlacement() {
    const next: Slot[] = picks.map((pick) => ({
      key: pick.recipe.id,
      recipeId: pick.recipe.id,
      day: null,
    }));
    setSlots(next);
    setActiveSlot(next[0]?.key ?? null);
    setStep(3);
  }

  function placeOnDay(day: number) {
    if (!activeSlot) return;
    haptics.select();
    setSlots((prev) => {
      const next = prev.map((s) => (s.key === activeSlot ? { ...s, day } : s));
      const stillOpen = next.find((s) => s.day === null);
      setActiveSlot(stillOpen?.key ?? null);
      return next;
    });
  }

  function autoFill() {
    haptics.success();
    const today = todayIndex(weekStart);
    const used = new Set<number>([
      ...takenDays,
      ...slots.filter((s) => s.day !== null).map((s) => s.day as number),
    ]);
    const free = DAY_INDEXES.filter((d) => !used.has(d) && (today === null || d >= today));

    const take = (day: number) => {
      const i = free.indexOf(day);
      if (i >= 0) free.splice(i, 1);
    };

    // Longest cooks choose first, so the 90-minute braise gets a weekend.
    const open = slots
      .filter((s) => s.day === null)
      .sort((a, b) => minutesFor(b.recipeId) - minutesFor(a.recipeId));

    const assigned = new Map<string, number>();
    for (const slot of open) {
      if (free.length === 0) break;
      const weekend = free.filter((d) => d === 0 || d === 6);
      const day = minutesFor(slot.recipeId) >= 45 && weekend.length > 0 ? weekend[0] : free[0];
      take(day);
      assigned.set(slot.key, day);
    }
    setSlots((prev) => prev.map((s) => (assigned.has(s.key) ? { ...s, day: assigned.get(s.key)! } : s)));
    setActiveSlot(null);
  }

  async function commit() {
    setSaving(true);
    await onCommit(
      picks,
      slots.map((s) => ({ recipeId: s.recipeId, day: s.day })),
      servings,
    );
    setSaving(false);
    haptics.success();
    onClose();
  }

  /**
   * One line of the setup sentence: "I want to cook — 3 — meals". Three stacked
   * dial-sized steppers would read as a form; three sentence rows read as one
   * thought, and take up less room than the two big ones they replace.
   */
  const numberRow = (
    lead: string,
    value: number,
    set: (n: number) => void,
    unit: string,
    min: number,
    max: number,
  ) => {
    const round = {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.bg,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    };
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 9,
          paddingHorizontal: 13,
          paddingVertical: 9,
          marginBottom: 7,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: 4,
          backgroundColor: t.card,
        }}
      >
        <Serif size={16} color={t.textSoft} numberOfLines={1} style={{ flex: 1 }}>
          {lead}
        </Serif>
        <Pressable
          hitSlop={6}
          onPress={() => {
            haptics.select();
            set(Math.max(min, value - 1));
          }}
          style={round}
        >
          <Ionicons name="remove" size={16} color={t.green} />
        </Pressable>
        <Serif size={27} style={{ minWidth: 28, textAlign: 'center', lineHeight: 32 }}>
          {value}
        </Serif>
        <Pressable
          hitSlop={6}
          onPress={() => {
            haptics.select();
            set(Math.min(max, value + 1));
          }}
          style={round}
        >
          <Ionicons name="add" size={16} color={t.green} />
        </Pressable>
        <Mono size={9} style={{ letterSpacing: 1.3, minWidth: 42 }}>
          {unit.toUpperCase()}
        </Mono>
      </View>
    );
  };

  /** Prefs recap — sits above the browser's mode switch, so the answers you
   *  gave are always in sight and always one tap from being changed. */
  const prefsRecap = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: 999,
        backgroundColor: t.card,
        paddingLeft: 14,
        paddingRight: 6,
        paddingVertical: 6,
        marginHorizontal: 20,
        marginBottom: 14,
      }}
    >
      <Mono size={9.5} color={t.textSoft} style={{ letterSpacing: 1 }}>
        {meals} COOKS × {nights} MEAL{nights === 1 ? '' : 'S'} · {servings} PEOPLE
      </Mono>
      <Pressable
        onPress={() => setStep(1)}
        style={{ borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}
      >
        <Body size={12} color={t.green}>
          Change
        </Body>
      </Pressable>
    </View>
  );

  return (
    // Full screen, not `pageSheet`. A page sheet is laid out by UIKit at a
    // height React Native doesn't reliably know about, so the pinned footer —
    // the only way forward through the flow — ended up below the sheet's
    // visible edge and untappable. Full screen means the flex layout here and
    // the visible screen are the same box, so the footer is always reachable.
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: t.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: insets.top + 12,
            paddingBottom: 14,
            borderBottomWidth: 1,
            borderBottomColor: t.border,
          }}
        >
          <View>
            <Mono size={9.5} color={t.green} style={{ letterSpacing: 1.6 }}>
              {step === 1
                ? 'SET UP · ONCE'
                : step === 2
                  ? `${picks.length} OF ${meals} COOKS · ${totalMeals} MEAL${totalMeals === 1 ? '' : 'S'}`
                  : 'CHOOSE COOKING DAYS'}
            </Mono>
            <Serif size={23} style={{ marginTop: 6 }}>
              Plan the week
            </Serif>
          </View>
          <Pressable onPress={onClose} hitSlop={10} style={{ paddingTop: 4 }}>
            <Ionicons name="close" size={22} color={t.muted} />
          </Pressable>
        </View>

        {step === 2 ? (
          <RecipeBrowser
            open={open}
            data={data}
            selectedIds={pickedIds}
            onSelect={togglePick}
            topSlot={prefsRecap}
            renderCardExtra={(recipe) => {
              // One cook can cover several flexible meals.
              const pick = picks.find((p) => p.recipe.id === recipe.id);
              if (!pick) return null;
              const { total, asWritten } = servingsFor(pick);
              return (
                <Pressable
                  onPress={() => cycleNights(recipe.id)}
                  style={{
                    alignSelf: 'flex-start',
                    marginTop: 5,
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: t.green,
                    backgroundColor: t.greenLight,
                  }}
                >
                  <Mono size={9} color={t.green} style={{ letterSpacing: 0.8 }}>
                    {pick.nights}× · {asWritten ? 'MAKES' : 'SERVES'} {total}
                  </Mono>
                </Pressable>
              );
            }}
          />
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 30 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {/* ── Step 1: one sentence, three numbers ───── */}
            {step === 1 && (
              <View>
                <Serif size={20} style={{ marginBottom: 14 }}>
                  How does a normal week go?
                </Serif>

                {numberRow('I want to cook', meals, setMeals, 'recipes', 1, 14)}
                {numberRow('for', servings, setServings, 'people', 1, 12)}
                {numberRow('each batch covers', nights, setNights, 'meals', 1, 7)}

                {/* The whole point of the sentence: you never do the multiplication. */}
                <View
                  style={{
                    marginTop: 16,
                    paddingHorizontal: 15,
                    paddingVertical: 13,
                    borderLeftWidth: 2,
                    borderLeftColor: t.green,
                    backgroundColor: t.greenLight,
                    borderRadius: 3,
                  }}
                >
                  <Serif size={19} style={{ lineHeight: 24 }}>
                    That's{' '}
                    <Serif size={19} color={t.green} italic>
                      {plannedMeals} meal{plannedMeals === 1 ? '' : 's'}
                    </Serif>{' '}
                    covered.
                  </Serif>
                  <Body size={12.5} color={t.textSoft} style={{ lineHeight: 19, marginTop: 5 }}>
                    {nights === 1
                      ? `Each cook shops for ${servings} serving${servings === 1 ? '' : 's'}.`
                      : `One cook covers ${nights} meals, so each batch shops for ${servings * nights} servings.`}
                    {plannedMeals > 7 ? ' That covers more than seven dinners, so you’ll have some spare.' : ''}
                    {' A recipe already written for more than that is planned whole, never scaled down.'}
                  </Body>
                </View>

                <Mono size={9} style={{ letterSpacing: 1.3, marginTop: 12, lineHeight: 14 }}>
                  SAVED FOR NEXT TIME — YOU'LL SKIP STRAIGHT TO PICKING
                </Mono>
              </View>
            )}

            {/* ── Step 3: place them ───────────────────── */}
            {step === 3 && (
              <View>
                <Body size={13.5} color={t.textSoft} style={{ lineHeight: 20, marginBottom: 14 }}>
                  Pick a recipe below, then tap the day you plan to cook it. Later meals from the batch stay flexible.
                </Body>

                {DAY_INDEXES.map((d) => {
                  const slot = slots.find((s) => s.day === d);
                  const recipe = slot ? recipeFor(slot.recipeId) : undefined;
                  const busy = takenDays.has(d);
                  const date = dayDate(weekStart, d);
                  return (
                    <Pressable
                      key={d}
                      onPress={() => !busy && placeOnDay(d)}
                      disabled={busy}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingHorizontal: 10,
                        paddingVertical: 9,
                        marginBottom: 6,
                        borderRadius: 4,
                        borderWidth: 1,
                        borderStyle: slot || busy ? 'solid' : 'dashed',
                        borderColor: slot ? t.green : t.border,
                        backgroundColor: slot ? t.greenLight : t.card,
                        opacity: busy ? 0.5 : 1,
                      }}
                    >
                      <Mono size={9.5} style={{ width: 46, letterSpacing: 0.6 }}>
                        {DAY_SHORT[d].toUpperCase()} {date.getDate()}
                      </Mono>
                      {recipe ? (
                        <>
                          {recipe.image_url ? (
                            <Image
                              source={{ uri: recipe.image_url }}
                              style={{ width: 32, height: 32, borderRadius: 3 }}
                              contentFit="cover"
                              cachePolicy="memory-disk"
                              recyclingKey={recipe.id}
                            />
                          ) : (
                            <View style={{ width: 32, height: 32, borderRadius: 3, backgroundColor: t.paper3 }} />
                          )}
                          <Serif size={15} numberOfLines={1} style={{ flex: 1 }}>
                            {recipe.title}
                          </Serif>
                        </>
                      ) : (
                        <Mono size={9} style={{ flex: 1, letterSpacing: 1.2 }}>
                          {busy ? 'ALREADY PLANNED' : activeSlot ? 'TAP TO PLACE' : 'FREE'}
                        </Mono>
                      )}
                    </Pressable>
                  );
                })}

                <View style={{ marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.border }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                    <Mono size={9} style={{ letterSpacing: 1.5 }}>
                      STILL TO PLACE
                    </Mono>
                    <Mono size={10}>{slots.filter((s) => s.day === null).length}</Mono>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {slots
                      .filter((s) => s.day === null)
                      .map((s) => {
                        const recipe = recipeFor(s.recipeId);
                        const isActive = activeSlot === s.key;
                        return (
                          <Pressable
                            key={s.key}
                            onPress={() => {
                              haptics.select();
                              setActiveSlot(s.key);
                            }}
                            style={{
                              width: 52,
                              height: 52,
                              borderRadius: 3,
                              overflow: 'hidden',
                              backgroundColor: t.paper3,
                              borderWidth: isActive ? 2 : 1,
                              borderColor: isActive ? t.greenSolid : t.border,
                            }}
                          >
                            {recipe?.image_url ? (
                              <Image
                                source={{ uri: recipe.image_url }}
                                style={{ width: '100%', height: '100%' }}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                recyclingKey={recipe.id}
                              />
                            ) : (
                              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="restaurant-outline" size={16} color={t.muted} />
                              </View>
                            )}
                          </Pressable>
                        );
                      })}
                  </View>
                </View>
              </View>
            )}
          </ScrollView>
        )}

        {/* Footer — always on screen, never behind the tab bar or the keyboard. */}
        <View
          style={{
            flexDirection: 'row',
            gap: 8,
            paddingHorizontal: 20,
            paddingTop: 14,
            paddingBottom: Math.max(insets.bottom, 12) + 12,
            borderTopWidth: 1,
            borderTopColor: t.border,
            backgroundColor: t.card,
          }}
        >
          {step === 1 && (
            <Button
              label="Choose recipes"
              onPress={() => {
                haptics.success();
                onSavePrefs({ meals, servings, nights });
                setStep(2);
              }}
              style={{ flex: 1 }}
            />
          )}
          {step === 2 && (
            <>
              <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
              <Button
                label={picks.length === 0 ? 'Pick some recipes' : `Next — place ${picks.length} cook${picks.length === 1 ? '' : 's'}`}
                onPress={goToPlacement}
                disabled={picks.length === 0}
                style={{ flex: 1.4 }}
              />
            </>
          )}
          {step === 3 && (
            <>
              <Button label="Fill it in for me" variant="secondary" onPress={autoFill} style={{ flex: 1 }} />
              <Button label={saving ? 'Adding…' : 'Done'} onPress={commit} disabled={saving} style={{ flex: 1 }} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
