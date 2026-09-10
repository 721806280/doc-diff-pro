import type { I18nMessages } from '@/i18n/messages';
import type { DocumentPaneState } from '@/types/document';

/** Keep pane notices and the comparison summary on the same coverage rules. */
export function documentCoverage(document: DocumentPaneState, i18n: I18nMessages) {
  const { graphics, revisions, warnings } = document;
  // An embedded object's rejected preview can also be counted by the package
  // scan. Count only the additional rejected images, as the pane already does.
  const additionalImages = Math.max(0, document.droppedImageCount - graphics.embeddedObjects);
  const unavailable = additionalImages + graphics.nativeGraphics + graphics.embeddedObjects + graphics.formulas;
  const reasons = [
    additionalImages > 0 ? i18n.documentPane.droppedImageTitle : '',
    graphics.nativeGraphics > 0 ? i18n.documentPane.nativeGraphicsDetail(graphics.nativeGraphics) : '',
    graphics.embeddedObjects > 0 ? i18n.documentPane.embeddedObjectDetail(graphics.embeddedObjects) : '',
    ...(graphics.embeddedObjects > 0
      ? graphics.embeddedObjectKinds.map((kind) => i18n.documentPane.embeddedObjectLabel(kind.progId, kind.title))
      : []),
    graphics.formulas > 0 ? i18n.documentPane.formulaDetail(graphics.formulas) : ''
  ].filter(Boolean);

  return {
    unavailable,
    reasons,
    revisions: revisions.insertions + revisions.deletions,
    limited: unavailable > 0 || warnings.length > 0
  };
}
