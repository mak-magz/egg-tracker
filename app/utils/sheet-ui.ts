// The `ui` for a form overlay: a bottom sheet below md, a centred dialog at md+ (feature 01 §2.5 "Log production",
// reused by Clients, feature 03 §3.4). Extracted from ProductionFormOverlay without changing it.
//
// Tailwind only generates classes it can read as whole strings in the source, so the dialog widths are a fixed
// map of literal classes instead of a template string built from a number.
const DIALOG_WIDTH = {
  /** The design's Add client dialog (about 420px). */
  420: 'md:max-w-[420px]',
  /** The Log / Edit production dialog. */
  520: 'md:max-w-[520px]',
} as const

export type SheetDialogWidth = keyof typeof DIALOG_WIDTH

export function sheetUi(dialogWidth: SheetDialogWidth) {
  return {
    overlay: 'bg-[rgba(15,23,43,.5)] backdrop-blur-[4px]',
    content: [
      // Phone: the design's bottom sheet, lifted by the keyboard inset (`--sheet-kb`, see useSheetKeyboard).
      'inset-x-0 left-0 top-auto bottom-(--sheet-kb,0px) translate-x-0 translate-y-0 w-full max-w-none',
      'rounded-t-2xl rounded-b-none ring-0 shadow-xl divide-y-0',
      'max-h-[min(88dvh,calc(var(--sheet-vvh,100dvh)-1rem))] sm:max-h-[min(88dvh,calc(var(--sheet-vvh,100dvh)-1rem))]',
      'data-[state=open]:animate-[slide-in-from-bottom_200ms_var(--ease-out)] data-[state=closed]:animate-[slide-out-to-bottom_200ms_var(--ease-out)]',
      'motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none',
      // md+: the centred dialog.
      'md:inset-x-auto md:top-1/2 md:left-1/2 md:bottom-auto md:-translate-x-1/2 md:-translate-y-1/2',
      `md:w-[calc(100vw-2rem)] ${DIALOG_WIDTH[dialogWidth]} md:rounded-2xl md:max-h-[85vh]`,
      'md:data-[state=open]:animate-[scale-in_200ms_var(--ease-out)] md:data-[state=closed]:animate-[scale-out_200ms_var(--ease-out)]',
    ].join(' '),
  }
}
