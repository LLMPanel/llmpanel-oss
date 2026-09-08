/**
 * Shared class string for the primary nav rows in the dashboard and deployment
 * sidebars. Lives here so the two can't drift apart.
 *
 * Selection is expressed exactly once — a tinted pill that also colours the
 * icon. The previous treatment stacked three signals to say the same thing: a
 * neutral fill from the base variant, an inset accent rail on top of it, and a
 * coloured icon. Because the pill is now accent-tinted rather than neutral, the
 * hover and press states have to be re-stated for the active row, otherwise the
 * base `hover:bg-sidebar-accent` would knock it back to grey.
 */
export const SIDEBAR_NAV_ITEM_CLASS = [
  "h-8 rounded-lg text-[13px]",

  // Idle icons sit back so the label leads; the active icon takes the accent.
  "[&_svg]:text-sidebar-foreground/70",
  "data-[active=true]:[&_svg]:text-sidebar-primary",

  // Selected: one accent-tinted pill. Deepens on hover, deeper still on press.
  "data-[active=true]:bg-sidebar-primary/12",
  "data-[active=true]:hover:bg-sidebar-primary/18",
  "data-[active=true]:active:bg-sidebar-primary/24",
  "dark:data-[active=true]:bg-sidebar-primary/15",
  "dark:data-[active=true]:hover:bg-sidebar-primary/22",
  "dark:data-[active=true]:active:bg-sidebar-primary/28",

  // The base variant only transitions width/height/padding, so colour snapped.
  // Short enough that the press still reads as instant.
  "transition-colors duration-100 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)]",
  "motion-reduce:transition-none",
].join(" ")
