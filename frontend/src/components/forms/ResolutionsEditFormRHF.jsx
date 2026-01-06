import React from 'react';
import { useForm } from 'react-hook-form';
import RHFForm, { RHFSelect, RHFTextField } from '../forms/rhf/RHFForm';

const ResolutionsEditFormRHF = ({ initialValues, onSubmit, onCancel }) => {
  const defaultValues = {
    is_dealt: initialValues?.is_dealt ?? 0,
    dealt_notes: initialValues?.dealt_notes ?? '',
  };
  const methods = useForm({ defaultValues });
  React.useEffect(() => {
    methods.reset(defaultValues);
  }, [initialValues, defaultValues, methods]);

  return (
    <RHFForm id="resolutions-edit-form" methods={methods} defaultValues={defaultValues} onSubmit={onSubmit} onCancel={onCancel}>
      <RHFSelect
        name="is_dealt"
        label="Status"
        options={[
          { value: 0, label: 'Review' },
          { value: 1, label: 'Done' },
        ]}
      />
      <RHFTextField name="dealt_notes" label="Notes" multiline rows={3} />
    </RHFForm>
  );
};

export default ResolutionsEditFormRHF;