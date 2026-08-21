import { Ionicons } from '@expo/vector-icons';
import { COOK_BAR_VISIBLE, cookProgress } from '@recipe-aggregator/shared/cookSession';
import type { ActiveCook } from '@recipe-aggregator/shared/cookSession';
import { usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AddToCookSheet from '@/components/AddToCookSheet';
import BottomSheet from '@/components/BottomSheet';
import PressableScale from '@/components/PressableScale';
import { Body, Button, Mono, Serif } from '@/components/ui';
import { useCookSession } from '@/context/CookSessionContext';
import { useCookBarVisible, useViewingRecipeId } from '@/lib/cookBar';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';

/*
 * "On the stove" — the persistent switcher, modelled on the iOS in-call bar.
 *
 * Floats above the tab bar, so a cook is never something you can navigate away
 * from by accident. One pill per recipe: tap one to jump straight to it, exactly
 * where you left off. The pill for the recipe you're looking at is filled in;
 * the others are outlined, so the bar reads as "tap here to get back to the
 * other thing" without needing a label.
 *
 * Renders nothing when nothing is cooking — and nothing when a single cook is
 * already the recipe on screen, where it would only repeat what you can see.
 * `shouldShowCookBar` in shared holds that rule.
 */

/** Routes that sit inside the bottom tabs, and so need the bar lifted above it. */
const TAB_ROUTES = ['/', '/meal-plan', '/cookbooks', '/profile', '/add'];
const TAB_BAR_HEIGHT = 84;

function CookPill({
  cook,
  current,
  solo,
  onPress,
}: {
  cook: ActiveCook;
  current: boolean;
  solo: boolean;
  onPress: () => void;
}) {
  const { done, total, fraction } = cookProgress(cook);
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.97}
      style={{
        flex: solo ? undefined : 1,
        minWidth: 0,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 999,
        // Filled = the one on screen. Outlined = elsewhere, tap to go there.
        backgroundColor: current ? 'rgba(255,255,255,0.20)' : 'transparent',
        borderWidth: 1,
        borderColor: current ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.24)',
      }}
    >
      <Serif size={14} color="#fff" numberOfLines={1} style={{ opacity: current ? 1 : 0.92 }}>
        {cook.title}
      </Serif>
      {total > 0 && (
        <>
          <Mono size={9} color="rgba(255,255,255,0.75)" style={{ marginTop: 2 }}>
            {solo ? `STEP ${Math.min(done + 1, total)} OF ${total}` : `${done}/${total}`}
          </Mono>
          {/* Progress rail — a plain View, so no react-native-svg dependency
              just to draw a line. Reads at a glance without the number. */}
          <View
            style={{
              height: 2,
              borderRadius: 2,
              marginTop: 4,
              backgroundColor: 'rgba(255,255,255,0.25)',
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                height: '100%',
                width: `${Math.round(fraction * 100)}%`,
                borderRadius: 2,
                backgroundColor: '#fff',
              }}
            />
          </View>
        </>
      )}
    </PressableScale>
  );
}

export default function CookingBar() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { cooks, session, switchCook, endCook, clearSession } = useCookSession();
  // Which recipe is actually on screen — not the same as the session's active
  // cook, since you can be on the plan or browsing.
  const viewingId = useViewingRecipeId();
  const visible = useCookBarVisible();
  const [showAdd, setShowAdd] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  if (!visible) return null;

  // The share and onboarding flows own the whole screen; a cooking bar over a
  // modal or the first-run carousel would just be in the way.
  if (pathname === '/share-recipe' || pathname === '/onboarding' || pathname === '/sign-in') return null;

  const onTabs = TAB_ROUTES.includes(pathname);
  const bottom = onTabs ? TAB_BAR_HEIGHT : insets.bottom;

  function goTo(recipeId: string) {
    haptics.select();
    switchCook(recipeId);
    setShowMenu(false);
    // `navigate`, not `push`: bouncing between two pots would otherwise stack a
    // new copy of each recipe screen every single time you switched.
    router.navigate({ pathname: '/recipe/[id]', params: { id: recipeId } });
  }

  const solo = cooks.length === 1;

  const pills = cooks.map((cook) => (
    <CookPill
      key={cook.recipeId}
      cook={cook}
      current={cook.recipeId === viewingId}
      solo={solo}
      onPress={() => goTo(cook.recipeId)}
    />
  ));

  return (
    <>
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 0, right: 0, bottom, alignItems: 'center' }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: t.cookBar,
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: -2 },
            elevation: 8,
          }}
        >
          {/* Four or more cooks is unusual but shouldn't clip — scroll rather
              than squeeze the pills into unreadable slivers. */}
          {cooks.length > COOK_BAR_VISIBLE ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, alignItems: 'center' }}
              style={{ flex: 1 }}
            >
              {pills}
            </ScrollView>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>{pills}</View>
          )}

          <Pressable
            onPress={() => {
              haptics.medium();
              setShowAdd(true);
            }}
            accessibilityLabel="Cook another recipe"
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.16)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.26)',
            }}
          >
            <Ionicons name="add" size={19} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => {
              haptics.light();
              setShowMenu(true);
            }}
            accessibilityLabel="Cooking options"
            hitSlop={8}
            style={{ width: 24, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="chevron-up" size={18} color="rgba(255,255,255,0.8)" />
          </Pressable>
        </View>
      </View>

      {/* The only place a cook can be stopped without finishing it — the escape
          hatch the old URL-param cook mode never had. */}
      <BottomSheet open={showMenu} onClose={() => setShowMenu(false)} maxHeightRatio={0.7}>
        <View style={{ paddingHorizontal: 20 }}>
          <Serif size={20} weight="semi" style={{ marginBottom: 12 }}>
            On the stove
          </Serif>

          {cooks.map((cook) => {
            const { done, total } = cookProgress(cook);
            const isActive = cook.recipeId === session.activeRecipeId;
            return (
              <View key={cook.recipeId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Pressable
                  onPress={() => goTo(cook.recipeId)}
                  style={{
                    flex: 1,
                    paddingVertical: 11,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    backgroundColor: isActive ? t.greenLight : 'transparent',
                    borderWidth: 1,
                    borderColor: isActive ? t.green : 'transparent',
                  }}
                >
                  <Body size={14} weight="semi" numberOfLines={1}>
                    {cook.title}
                  </Body>
                  {total > 0 && (
                    <Mono size={10} color={t.muted} style={{ marginTop: 2 }}>
                      {done} OF {total} STEPS
                    </Mono>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => {
                    haptics.light();
                    endCook(cook.recipeId);
                    if (cooks.length <= 1) setShowMenu(false);
                  }}
                  accessibilityLabel={`Stop cooking ${cook.title}`}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: t.border,
                  }}
                >
                  <Ionicons name="close" size={16} color={t.muted} />
                </Pressable>
              </View>
            );
          })}

          <Button
            label="Cook another recipe"
            full
            onPress={() => {
              setShowMenu(false);
              setShowAdd(true);
            }}
            style={{ marginTop: 10 }}
          />
          {cooks.length > 1 && (
            <Pressable
              onPress={() => {
                haptics.light();
                clearSession();
                setShowMenu(false);
              }}
              style={{ paddingVertical: 12, alignItems: 'center' }}
            >
              <Body size={14} color={t.muted}>
                Stop all cooking
              </Body>
            </Pressable>
          )}
        </View>
      </BottomSheet>

      <AddToCookSheet open={showAdd} onClose={() => setShowAdd(false)} />
    </>
  );
}
