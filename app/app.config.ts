// Nuxt UI theme, set once here (T15). Design: docs/features/00-project-scaffold.md §2.5 "Design tokens & theming".
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'green',
      secondary: 'blue',
      success: 'green',
      info: 'blue',
      warning: 'yellow',
      error: 'red',
      neutral: 'slate',
    },
    icons: {
      // The design's sidebar toggle is a chevron (UDashboardSidebarCollapse reads these).
      panelClose: 'i-lucide-chevron-left',
      panelOpen: 'i-lucide-chevron-right',
    },
    // 44px touch targets (C5): forms use size="xl"; Nuxt UI's xl is 40px tall, so add 2px each way.
    button: {
      variants: {
        size: {
          xl: { base: 'py-2.5' },
        },
      },
    },
    input: {
      variants: {
        size: {
          xl: { base: 'py-2.5' },
        },
      },
    },
    card: {
      // Design: cards and the auth card use a 16px radius.
      slots: {
        root: 'rounded-2xl',
      },
    },
    navigationMenu: {
      compoundVariants: [
        {
          // Design: the active nav item has a 12% primary tint (not the neutral elevated fill).
          color: 'primary',
          variant: 'pill',
          active: true,
          class: {
            link: 'before:bg-primary/12',
          },
        },
        {
          // Design: inactive nav items hover to bg-elevated.
          variant: 'pill',
          active: false,
          disabled: false,
          class: {
            link: 'hover:before:bg-elevated',
          },
        },
      ],
    },
  },
})
