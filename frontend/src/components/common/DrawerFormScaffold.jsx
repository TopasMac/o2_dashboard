import React from 'react';
import AppDrawer from './AppDrawer';
import DrawerScaffold from './DrawerScaffold';

/**
 * DrawerFormScaffold
 *
 * A small composition helper for form-based drawers.
 * - Uses AppDrawer for the outer shell + header + (optional) standard actions footer
 * - Uses DrawerScaffold for body layout (padding/max width) and optional footer slot
 *
 * Notes:
 * - Prefer using AppDrawer's `showActions` for Save/Cancel/Delete (consistent across app)
 * - Use DrawerScaffold's `footer` only for non-form drawers or custom footers
 */
export default function DrawerFormScaffold({
  // AppDrawer
  open,
  onClose,
  size = 'default',
  fullScreenOnMobile = true,
  mobileVariant = 'fullscreen',
  title,
  hideHeader = false,
  headerLink,

  // Form actions (passed through to AppDrawer)
  formId,
  showActions = true,
  actions = {},
  extraActions = null,
  onDelete,

  // Body layout (passed to DrawerScaffold)
  bodyPadding = 16,
  maxContentWidth = '100%',
  fullBleed = false,

  // Optional custom footer (only if you want something other than AppDrawer actions)
  footer = null,
  footerSticky = true,

  // Content
  children,
}) {
  return (
    <AppDrawer
      open={open}
      onClose={onClose}
      size={size}
      fullScreenOnMobile={fullScreenOnMobile}
      mobileVariant={mobileVariant}
      title={title}
      hideHeader={hideHeader}
      headerLink={headerLink}
      formId={formId}
      showActions={showActions}
      actions={actions}
      extraActions={extraActions}
      onDelete={onDelete}
    >
      <DrawerScaffold
        bodyPadding={bodyPadding}
        maxContentWidth={maxContentWidth}
        fullBleed={fullBleed}
        footer={footer}
        footerSticky={footerSticky}
      >
        {children}
      </DrawerScaffold>
    </AppDrawer>
  );
}
