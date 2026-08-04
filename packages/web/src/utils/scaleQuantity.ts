// Quantity scaling + formatting helpers shared by the recipe detail page and the
// meal plan.
//
// The implementation now lives in packages/shared/src/scaling.ts so the
// sub-recipe expansion can use it too. Re-exported from here so existing imports
// keep working.

export {
  parseFraction,
  formatQuantity,
  scaleQuantity,
  scaleIngredientsForServings,
} from '@recipe-aggregator/shared';
