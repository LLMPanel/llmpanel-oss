import type { Variants } from "motion/react"

/**
 * Shared enter animation for wizard steps.
 *
 * Each step wraps its top-level sections in `motion.div variants={stepItem}`
 * under a `motion.div variants={stepContainer}` root — content chunks then
 * stagger in (~50ms apart) instead of the whole panel appearing at once.
 * Springs use `bounce: 0` per the interface-polish guidelines.
 */
export const stepContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05, delayChildren: 0.04 },
  },
}

export const stepItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", duration: 0.4, bounce: 0 },
  },
}
