import React from 'react';
import PropTypes from 'prop-types';
import { Box, Typography } from '@mui/material';
import AppDrawer from '../AppDrawer';

/**
 * MobileFormDrawer
 * Lightweight wrapper around AppDrawer preconfigured for mobile forms.
 * - Full-screen on mobile by default
 * - Teal header (#1E6F68) with white text to match MobileShell
 * - Leaves actions/footer behavior to AppDrawer
 * - Can host any form via `FormComponent` and `formProps`, or render `children` directly
 */
const TEAL = '#1E6F68';

function MobileFormDrawer({
  open,
  onClose,
  title,
  headerLink = null,
  formId,
  showActions = true,
  actions = {},
  onDelete,
  onSubmitSuccess,
  onSubmitError,
  children,
  FormComponent = null,
  formProps = {},
  componentKey = undefined,
  headerSx,
  titleSx,
  contentSx,
  mobileVariant = 'sheet',
  ...props
}) {
  const grabHandle = (
    <Box
      sx={{
        width: 36,
        height: 4,
        borderRadius: 2,
        bgcolor: 'rgba(0,0,0,0.3)',
        mx: 'auto',
        my: 0.75,
      }}
    />
  );

  const header = (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        bgcolor: TEAL,
        color: '#fff',
        px: 2,
        py: 1.25,
        boxSizing: 'border-box',
        ...headerSx,
      }}
    >
      <Typography variant="h6" component="div" sx={{ m: 0, fontWeight: 600, ...titleSx }}>
        {title}
      </Typography>
      {headerLink ? <Box sx={{ ml: 2 }}>{headerLink}</Box> : null}
    </Box>
  );

  const handleSubmitSuccess = (result) => {
    if (typeof onSubmitSuccess === 'function') onSubmitSuccess(result);
    if (typeof onClose === 'function') onClose();
  };
  const handleSubmitError = (error) => {
    if (typeof onSubmitError === 'function') onSubmitError(error);
  };

  const effectiveActions = (!Array.isArray(actions) && actions) ? actions : {};

  return (
    <AppDrawer
      open={open}
      onClose={onClose}
      title={header}
      formId={formId}
      showActions={showActions}
      actions={effectiveActions}
      onDelete={onDelete}
      fullScreenOnMobile
      mobileVariant={mobileVariant}
      actionStyle="mobile"
      contentSx={{ p: 2, pb: 'max(16px, env(safe-area-inset-bottom))', ...contentSx }}
      {...props}
    >
      {mobileVariant === 'sheet' && grabHandle}
      {FormComponent ? (
        <FormComponent
          key={componentKey}
          onSubmitSuccess={handleSubmitSuccess}
          onSubmitError={handleSubmitError}
          {...formProps}
        />
      ) : children}
    </AppDrawer>
  );
}

MobileFormDrawer.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.node,
  headerLink: PropTypes.node,
  formId: PropTypes.string,
  showActions: PropTypes.bool,
  actions: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
  onDelete: PropTypes.func,
  onSubmitSuccess: PropTypes.func,
  onSubmitError: PropTypes.func,
  children: PropTypes.node,
  headerSx: PropTypes.object,
  titleSx: PropTypes.object,
  contentSx: PropTypes.object,
  FormComponent: PropTypes.elementType,
  formProps: PropTypes.object,
  componentKey: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  mobileVariant: PropTypes.oneOf(['sheet', 'fullscreen']),
};

export default MobileFormDrawer;
