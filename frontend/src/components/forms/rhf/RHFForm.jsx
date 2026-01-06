import React from 'react';
import PropTypes from 'prop-types';
import { FormProvider } from 'react-hook-form';

/**
 * RHFForm
 * ----------
 * A tiny wrapper that wires react-hook-form's FormProvider and renders a native <form>
 * with a stable id so external buttons (e.g., AppDrawer footer) can submit it via
 * <button type="submit" form={formId}>.
 *
 * Usage:
 *   <RHFForm formId="unit-tx-form" methods={methods} onSubmit={handleSave}>
 *     ... your fields ...
 *   </RHFForm>
 *   // You can import inputs from here too:
 *   // import RHFForm, { RHFTextField, RHFSelect, RHFAutocomplete, RHFDatePicker, RHFFile, RHFCheckbox } from './rhf/RHFForm';
 *   // <RHFForm ...>
 *   //   <RHFTextField ... />
 *   //   <RHFAutocomplete name="unit_id" label="Unit" options={[{value:1,label:'5aLia_13'}]} />
 *   //   <RHFSelect ... />
 *   // </RHFForm>
 */
export default function RHFForm({
  formId = 'o2-rhf-form',
  methods,
  onSubmit,
  onError,
  children,
  autoComplete = 'off',
  className,
  style,
  noValidate = true,
  // Layout options (defaults to vertical, one field per row)
  useGrid = true,
  gridColumns = '1fr',
  gridGap = 12,
  gridClassName,
  gridStyle,
  ...rest
}) {
  const mergedStyle = { paddingBottom: '0px', ...style };
  const mergedGridStyle = {
    display: 'grid',
    rowGap: 18, // vertical spacing between rows
    columnGap: 12, // horizontal spacing between columns
    gridTemplateColumns: gridColumns,
    width: '100%',
    ...(gridStyle || {}),
  };

  // Fallback render if methods are missing (prevents runtime crash during integration)
  if (!methods || typeof methods.handleSubmit !== 'function') {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('RHFForm: missing react-hook-form methods; rendering plain <form>.');
    }
    return (
      <form
        id={formId}
        noValidate={noValidate}
        autoComplete={autoComplete}
        className={className}
        style={mergedStyle}
        {...rest}
      >
        {useGrid ? (
          <div className={gridClassName ?? 'form-grid'} style={mergedGridStyle}>
            {children}
          </div>
        ) : (
          children
        )}
      </form>
    );
  }

  const submitHandler = methods.handleSubmit(
    onSubmit || (() => {}),
    onError || (() => {})
  );

  return (
    <FormProvider {...methods}>
      <form
        id={formId}
        noValidate={noValidate}
        autoComplete={autoComplete}
        className={className}
        style={mergedStyle}
        onSubmit={submitHandler}
        {...rest}
      >
        {useGrid ? (
          <div className={gridClassName ?? 'form-grid'} style={mergedGridStyle}>
            {children}
          </div>
        ) : (
          children
        )}
      </form>
    </FormProvider>
  );
}

RHFForm.propTypes = {
  formId: PropTypes.string,
  methods: PropTypes.object, // react-hook-form methods from useForm()
  onSubmit: PropTypes.func,
  onError: PropTypes.func,
  children: PropTypes.node,
  autoComplete: PropTypes.string,
  className: PropTypes.string,
  style: PropTypes.object,
  noValidate: PropTypes.bool,
  // Layout props
  useGrid: PropTypes.bool,
  gridColumns: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  gridGap: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  gridClassName: PropTypes.string,
  gridStyle: PropTypes.object,
};

// Re-exports: import everything from one place
export { default as RHFTextField } from './RHFTextField';
export { default as RHFSelect } from './RHFSelect';
export { default as RHFDatePicker } from './RHFDatePicker';
export { default as RHFFile } from './RHFFile';
export { default as RHFCheckbox } from './RHFCheckbox';
export { default as RHFAutocomplete } from './RHFAutocomplete';
