import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { supabase } from '@recipe-aggregator/shared';
import type { Cookbook } from '@recipe-aggregator/shared';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import CookbookEmptyState from '../components/CookbookEmptyState';
import CookbookFormModal from '../components/CookbookFormModal';
import SortableCookbookCard from '../components/SortableCookbookCard';
import SuggestCookbooksModal from '../components/SuggestCookbooksModal';
import { useAuth } from '../context/AuthContext';
import { PK, fSerif, fSans, fMono } from '../styles/pieKeeper';
import { Eyebrow } from '../components/pieKeeper/PieKeeperBits';

interface CookbooksViewProps {
  // Whether auth is still hydrating — wait before fetching to avoid empty RLS results
  authLoading: boolean;
}

interface RecipeImageRow {
  cookbook_id: string;
  recipes: { image_url: string | null; created_at: string } | null;
}

export default function CookbooksView({ authLoading }: CookbooksViewProps) {
  const { profile } = useAuth();
  const [cookbooks, setCookbooks] = useState<Cookbook[]>([]);
  const [imagesByCookbook, setImagesByCookbook] = useState<Record<string, string[]>>({});
  const [countsByCookbook, setCountsByCookbook] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const cbResult = await supabase
        .from('cookbooks')
        .select('id, user_id, name, description, emoji, sort_order, created_at, updated_at')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (cancelled) return;

      if (cbResult.error) {
        setError(cbResult.error.message);
        setLoading(false);
        return;
      }

      const cbList = (cbResult.data ?? []) as Cookbook[];
      setCookbooks(cbList);

      if (cbList.length === 0) {
        setLoading(false);
        return;
      }

      // Fetch all cookbook_recipes joined with the recipe image_url + created_at.
      // RLS scopes this naturally to family-visible cookbooks.
      const ids = cbList.map((c) => c.id);
      const crResult = await supabase
        .from('cookbook_recipes')
        .select('cookbook_id, recipes(image_url, created_at)')
        .in('cookbook_id', ids);

      if (cancelled) return;

      const counts: Record<string, number> = {};
      const imagesAccum: Record<string, { url: string; created_at: string }[]> = {};

      for (const row of ((crResult.data ?? []) as unknown) as RecipeImageRow[]) {
        counts[row.cookbook_id] = (counts[row.cookbook_id] ?? 0) + 1;
        // Supabase may return `recipes` as object or array depending on the relation
        const rec = Array.isArray(row.recipes) ? row.recipes[0] : row.recipes;
        if (rec?.image_url) {
          if (!imagesAccum[row.cookbook_id]) imagesAccum[row.cookbook_id] = [];
          imagesAccum[row.cookbook_id].push({
            url: rec.image_url,
            created_at: rec.created_at,
          });
        }
      }

      // Take 4 newest images per cookbook
      const images: Record<string, string[]> = {};
      for (const id of ids) {
        const list = (imagesAccum[id] ?? [])
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 4)
          .map((x) => x.url);
        images[id] = list;
      }

      setImagesByCookbook(images);
      setCountsByCookbook(counts);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [authLoading]);

  // Desktop: a small drag distance activates (taps still open a cookbook).
  // Mobile: a short press-and-hold activates. The delay is kept under Chrome's
  // ~500ms long-press so drag mode engages before its link-preview menu, while
  // still being long enough that any finger movement (scrolling) cancels first.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Swallow the stray click that fires right after a drop, so a drag never
  // opens a cookbook. A native window-level capture listener runs *before*
  // React (and React Router's Link), making this immune to render-timing races.
  const suppressNextClickRef = useRef(false);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, []);

  async function handleDragEnd(event: DragEndEvent) {
    // Clear the suppression flag shortly after the drop, in case no click
    // follows (e.g. touch), so a later genuine tap is never eaten.
    setTimeout(() => {
      suppressNextClickRef.current = false;
    }, 300);

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = cookbooks.findIndex((c) => c.id === active.id);
    const newIndex = cookbooks.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(cookbooks, oldIndex, newIndex);
    const previous = cookbooks;
    // Optimistic UI: snap to the new order immediately.
    setCookbooks(reordered);

    // Persist only the rows whose position changed.
    const updates = reordered
      .map((cb, i) => ({ id: cb.id, sort_order: i }))
      .filter((u, i) => previous[i]?.id !== u.id);

    const results = await Promise.all(
      updates.map((u) =>
        supabase.from('cookbooks').update({ sort_order: u.sort_order }).eq('id', u.id)
      )
    );

    if (results.some((r) => r.error)) {
      // Revert on failure.
      setCookbooks(previous);
      setError('Could not save the new order. Please try again.');
    }
  }

  const total = cookbooks.length;

  const subtitle = useMemo(() => {
    if (loading) return 'Loading your cookbooks…';
    if (total === 0) return 'No cookbooks yet — create one to start grouping recipes.';
    if (total === 1) return '1 cookbook in your collection.';
    return `${total} cookbooks in your collection · drag to reorder.`;
  }, [loading, total]);

  return (
    <>
      <div>
        <div>
          {/* Masthead */}
          <div className="mb-5" style={{ animation: 'fadeUp 0.4s ease both' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <Eyebrow>The shelves</Eyebrow>
                <h1
                  style={{
                    margin: '12px 0 0',
                    fontFamily: fSerif,
                    fontWeight: 400,
                    fontSize: 'clamp(30px, 8vw, 38px)',
                    lineHeight: 1.02,
                    letterSpacing: '-0.026em',
                    color: PK.ink,
                  }}
                >
                  Cookbooks
                  {profile?.display_name ? (
                    <>
                      ,{' '}
                      <em style={{ fontStyle: 'italic', color: PK.green }}>{profile.display_name}</em>
                    </>
                  ) : (
                    ''
                  )}
                </h1>
                <p
                  style={{
                    margin: '12px 0 0',
                    fontFamily: fSans,
                    fontSize: 14.5,
                    lineHeight: 1.45,
                    color: PK.inkSoft,
                    minHeight: '1.25rem',
                  }}
                >
                  {subtitle}
                </p>
              </div>
              {!loading && !error && total > 0 && (
                <button
                  onClick={() => setShowSuggest(true)}
                  title="Let AI propose cookbooks based on your library"
                  style={{
                    flexShrink: 0,
                    padding: '9px 16px',
                    background: 'transparent',
                    color: PK.ink,
                    border: `1px solid ${PK.rule}`,
                    borderRadius: 999,
                    fontFamily: fSans,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Sparkles size={14} strokeWidth={1.6} />
                  Suggest
                </button>
              )}
            </div>
          </div>

          {error && (
            <p className="text-center py-4" style={{ color: PK.red, fontFamily: fSans, fontSize: 14 }}>
              Error: {error}
            </p>
          )}

          {!loading && !error && total === 0 && (
            <CookbookEmptyState onCreate={() => setShowCreate(true)} />
          )}

          {!loading && !error && total > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={() => {
                suppressNextClickRef.current = true;
              }}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={cookbooks.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {cookbooks.map((cb, i) => (
                    <SortableCookbookCard
                      key={cb.id}
                      cookbook={cb}
                      recipeCount={countsByCookbook[cb.id] ?? 0}
                      coverImages={imagesByCookbook[cb.id] ?? []}
                      index={i}
                    />
                  ))}
                  {/* New cookbook — dashed editorial row */}
                  <button
                    onClick={() => setShowCreate(true)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '18px',
                      border: `1px dashed ${PK.green}`,
                      borderRadius: 4,
                      background: 'transparent',
                      color: PK.green,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      cursor: 'pointer',
                      animation: 'fadeUp 0.4s ease both',
                      animationDelay: `${Math.min(cookbooks.length * 0.05, 0.3)}s`,
                    }}
                  >
                    <Plus size={18} strokeWidth={1.6} />
                    <span style={{ fontFamily: fSerif, fontSize: 16, fontStyle: 'italic' }}>
                      New cookbook
                    </span>
                  </button>
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      <CookbookFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={(cb) => {
          setCookbooks((prev) => [cb, ...prev]);
          setCountsByCookbook((prev) => ({ ...prev, [cb.id]: 0 }));
          setImagesByCookbook((prev) => ({ ...prev, [cb.id]: [] }));
        }}
      />

      <SuggestCookbooksModal
        open={showSuggest}
        onClose={() => setShowSuggest(false)}
        onCreated={(cb, recipeCount) => {
          setCookbooks((prev) => [cb, ...prev]);
          setCountsByCookbook((prev) => ({ ...prev, [cb.id]: recipeCount }));
          setImagesByCookbook((prev) => ({ ...prev, [cb.id]: [] }));
        }}
      />
    </>
  );
}
