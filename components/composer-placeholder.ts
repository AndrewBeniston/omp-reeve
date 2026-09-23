type OptionalPlaceholder = () => string | undefined;

interface ComposerPlaceholderSlots {
  working: OptionalPlaceholder;
  callerOverride: OptionalPlaceholder;
  fallback: () => string;
}

export function selectComposerPlaceholder({
  working,
  callerOverride,
  fallback,
}: ComposerPlaceholderSlots): string {
  // Goal mode is reserved. Reeve does not have a goal state.
  const reservedGoalSlot: OptionalPlaceholder = () => undefined;
  // Plan mode is reserved. Reeve does not have a plan state.
  const reservedPlanSlot: OptionalPlaceholder = () => undefined;

  return working()
    ?? reservedGoalSlot()
    ?? reservedPlanSlot()
    ?? callerOverride()
    ?? fallback();
}
