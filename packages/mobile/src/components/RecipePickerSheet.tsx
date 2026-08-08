import { Ionicons } from '@expo/vector-icons';
import type { Recipe } from '@recipe-aggregator/shared';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RecipeBrowser, { type BrowseSort } from '@/components/RecipeBrowser';
import { Button, Mono, Serif } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';
import useRecipeBrowserData from '@/lib/useRecipeBrowserData';

interface Props {
  open: boolean;
  title?: string;
  /** Mono line above the title — says what this picker is for. */
  eyebrow?: string;
  /** Recipes already on the receiving side. Labelled, never blocked — you may
   *  well want a second batch of something, or the same thing twice. */
  existingIds: Set<string>;
  /** What that label says. */
  existingLabel?: string;
  /** Recipes to leave out of the list entirely — used to stop a recipe linking
   *  to itself. `existingIds` only hints; this hides. */
  excludeIds?: Set<string>;
  onPick: (recipe: Recipe) => void;
  onClose: () => void;
  /** Least recently cooked first, the order plan mode opens on. Call sites where
   *  you're hunting a known recipe by name (sub-recipe linking) pass 'a-z'. */
  defaultSort?: BrowseSort;
}

/**
 * Pick one recipe out of the collection. Deliberately the same screen as plan
 * mode's picking step — same full-screen sheet, same All-recipes / Cookbooks
 * switch, same search, filters and plate grid — because it is the same job.
 * The only difference is that one tap here chooses and you're done.
 */
export default function RecipePickerSheet({
  open,
  title = 'Add a recipe',
  eyebrow = 'PICK A RECIPE',
  existingIds,
  existingLabel = 'ALREADY ADDED',
  excludeIds,
  onPick,
  onClose,
  defaultSort = 'suggested',
}: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const data = useRecipeBrowserData(open);
  // Something you just added drops out of the list, so a picker you keep open
  // (adding several to a cookbook) always shows what's left to add.
  const [added, setAdded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) setAdded(new Set());
  }, [open]);

  const hidden = useMemo(() => {
    if (!excludeIds?.size) return added;
    return new Set([...added, ...excludeIds]);
  }, [added, excludeIds]);

  return (
    // Full screen, matching plan mode: the browser is a long virtualised list
    // with a pinned footer, which a bottom sheet can't hold without clipping.
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
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Mono size={9.5} color={t.green} style={{ letterSpacing: 1.6 }}>
              {added.size > 0
                ? `${added.size} ADDED · KEEP GOING`
                : eyebrow.toUpperCase()}
            </Mono>
            <Serif size={23} numberOfLines={2} style={{ marginTop: 6, lineHeight: 27 }}>
              {title}
            </Serif>
          </View>
          <Pressable onPress={onClose} hitSlop={10} style={{ paddingTop: 4 }}>
            <Ionicons name="close" size={22} color={t.muted} />
          </Pressable>
        </View>

        <RecipeBrowser
          open={open}
          data={data}
          excludeIds={hidden}
          defaultSort={defaultSort}
          emptyLabel="No recipes to add."
          onSelect={(recipe) => {
            haptics.success();
            onPick(recipe);
            setAdded((prev) => new Set(prev).add(recipe.id));
          }}
          renderCardExtra={(recipe) =>
            existingIds.has(recipe.id) ? (
              <Mono size={9} color={t.green} style={{ marginTop: 4, letterSpacing: 0.8 }}>
                {existingLabel.toUpperCase()}
              </Mono>
            ) : null
          }
        />

        {/* Footer — one tap picks and this closes, so all it needs is the way out. */}
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 14,
            paddingBottom: Math.max(insets.bottom, 12) + 12,
            borderTopWidth: 1,
            borderTopColor: t.border,
            backgroundColor: t.card,
          }}
        >
          <Button
            label={added.size > 0 ? `Done · ${added.size} added` : 'Cancel'}
            variant={added.size > 0 ? 'filled' : 'secondary'}
            onPress={onClose}
            full
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
