import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Box } from '@mui/material';
import dayjs from 'dayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';

// RHF wrappers from your project
import RHFForm from './rhf/RHFForm';
import RHFTextField from './rhf/RHFTextField';
import RHFSelect from './rhf/RHFSelect';
import widthMap from './rhf/widthMap';

const PLATFORMS = ['Instagram', 'Facebook', 'LinkedIn'];
const STATUSES = ['Draft', 'Scheduled', 'Published'];
const CHANNEL_TYPES = ['Organic', 'Paid'];

/**
 * PlanSocialPostFormRHF
 *
 * Props:
 * - formId?: string (default: 'plan-social-post-form')
 * - defaultDateTime?: string (YYYY-MM-DDTHH:mm) used for datetime-local input
 * - defaults?: object to prefill fields
 * - initialPlatform?: 'Instagram' | 'Facebook' | 'LinkedIn'
 * - onSubmit: (payload: { post: {...}, channel: {...} }) => void | Promise<void>
 * - submitting?: boolean (for parent-controlled loading state)
 */
export default function PlanSocialPostFormRHF({
  formId = 'plan-social-post-form',
  defaultDateTime = '',
  defaults = {},
  initialPlatform = 'Instagram',
  onSubmit,
  submitting = false,
}) {
  const methods = useForm({
    defaultValues: {
      title: defaults.title || '',
      theme: defaults.theme || '',
      platform: defaults.platform || initialPlatform,
      startDate: defaults.startDate ? dayjs(defaults.startDate) : (defaults.endDate ? null : (defaultDateTime ? dayjs(defaultDateTime) : null)),
      endDate: defaults.endDate ? dayjs(defaults.endDate) : (defaults.startDate ? null : (defaultDateTime ? dayjs(defaultDateTime) : null)),
      status: defaults.status || 'Scheduled',
      caption: defaults.caption || '',
      hashtags: defaults.hashtags || '',
      imagePath: defaults.imagePath || '',
      utmSource: defaults.utmSource || '',
      utmMedium: defaults.utmMedium || '',
      utmCampaign: defaults.utmCampaign || '',
      budget: defaults.budget ?? '',
      objective: defaults.objective ?? '',
      channelType: defaults.channelType || 'Organic',
    },
    mode: 'onChange',
  });

  const handleSubmit = (values) => {
    if (!values.title || !values.platform) return;
    if (!values.startDate || (!values.endDate && values.channelType === 'Paid')) return;

    const post = {
      title: values.title,
      theme: values.theme || null,
      caption: values.caption || null,
      hashtags: values.hashtags || null,
      imagePath: values.imagePath || null,
    };

    let channel = {
      platform: values.platform,
      status: values.status || 'Scheduled',
      utmSource: values.utmSource || null,
      utmMedium: values.utmMedium || null,
      utmCampaign: values.utmCampaign || null,
    };

    const selectedType = values.channelType || 'Organic';
    if (selectedType === 'Organic') {
      if (!values.startDate) return; // require at least one date
      const dt = dayjs(values.startDate).hour(14).minute(0).second(0).millisecond(0);
      channel.dateScheduled = dt.toISOString();
    } else {
      if (!values.startDate || !values.endDate) return;
      const start = dayjs(values.startDate).startOf('day');
      const end = dayjs(values.endDate).endOf('day');
      channel.startAt = start.toISOString();
      channel.endAt = end.toISOString();
    }
    channel.channelType = selectedType;

    onSubmit && onSubmit({ post, channel });
  };

  return (
    <RHFForm
      methods={methods}
      onSubmit={handleSubmit}
      formId={formId}
      gridColumns={12}
      gridGap={16}
      useGrid
    >
      <>
        <Box sx={{ gridColumn: 'span 12', minWidth: 0 }}>
          <RHFSelect
            name="channelType"
            label="Type"
            options={CHANNEL_TYPES.map((t) => ({ label: t, value: t }))}
            fullWidth
            size="small"
            sx={{ minWidth: 0 }}
          />
        </Box>

        {(methods.watch('channelType') === 'Paid') ? (
          <>
            {/* Second row (Paid): Start & End */}
            <Box sx={{ gridColumn: { xs: 'span 12', sm: 'span 6' }, minWidth: 0 }}>
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <Controller
                  name="startDate"
                  control={methods.control}
                  rules={{ required: 'Start date is required' }}
                  render={({ field, fieldState }) => (
                    <DatePicker
                      label="Start date"
                      value={field.value}
                      onChange={(newValue) => field.onChange(newValue)}
                      format="DD-MM-YYYY"
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          size: 'small',
                          error: !!fieldState.error,
                          helperText: fieldState.error?.message,
                          sx: { minWidth: 0 },
                        },
                      }}
                    />
                  )}
                />
              </LocalizationProvider>
            </Box>
            <Box sx={{ gridColumn: { xs: 'span 12', sm: 'span 6' }, minWidth: 0 }}>
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <Controller
                  name="endDate"
                  control={methods.control}
                  rules={{ required: 'End date is required' }}
                  render={({ field, fieldState }) => (
                    <DatePicker
                      label="End date"
                      value={field.value}
                      onChange={(newValue) => field.onChange(newValue)}
                      format="DD-MM-YYYY"
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          size: 'small',
                          error: !!fieldState.error,
                          helperText: fieldState.error?.message,
                          sx: { minWidth: 0 },
                        },
                      }}
                    />
                  )}
                />
              </LocalizationProvider>
            </Box>

            {/* Third row (Paid): Objective & Budget) */}
            <Box sx={{ gridColumn: { xs: 'span 12', sm: 'span 6' }, minWidth: 0 }}>
              <RHFTextField name="objective" label="Objective" fullWidth size="small" sx={{ minWidth: 0 }} />
            </Box>
            <Box sx={{ gridColumn: { xs: 'span 12', sm: 'span 6' }, minWidth: 0 }}>
              <RHFTextField name="budget" label="Budget" type="number" inputProps={{ step: '0.01', min: '0' }} fullWidth size="small" sx={{ minWidth: 0 }} />
            </Box>
          </>
        ) : (
          // Organic: single Date just after Type
          <Box sx={{ gridColumn: 'span 12', minWidth: 0 }}>
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <Controller
                name="startDate"
                control={methods.control}
                rules={{ required: 'Date is required' }}
                render={({ field, fieldState }) => (
                  <DatePicker
                    label="Date"
                    value={field.value}
                    onChange={(newValue) => field.onChange(newValue)}
                    format="DD-MM-YYYY"
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        size: 'small',
                        error: !!fieldState.error,
                        helperText: fieldState.error?.message,
                        sx: { minWidth: 0 },
                      },
                    }}
                  />
                )}
              />
            </LocalizationProvider>
          </Box>
        )}

        <Box sx={{ gridColumn: 'span 12', minWidth: 0 }}>
          <RHFSelect
            name="status"
            label="Status"
            options={STATUSES.map((s) => ({ label: s, value: s }))}
            fullWidth
            size="small"
            sx={{ minWidth: 0 }}
          />
        </Box>

        <Box sx={{ gridColumn: 'span 12', minWidth: 0 }}>
          <RHFTextField
            name="title"
            label="Title"
            required
            rules={{ required: 'Title is required' }}
            fullWidth
            size="small"
            sx={{ minWidth: 0 }}
          />
        </Box>

        <Box sx={{ gridColumn: { xs: 'span 12', sm: 'span 6' }, minWidth: 0 }}>
          <RHFTextField name="theme" label="Theme" fullWidth size="small" sx={{ minWidth: 0 }} />
        </Box>

        <Box sx={{ gridColumn: { xs: 'span 12', sm: 'span 6' }, minWidth: 0 }}>
          <RHFSelect
            name="platform"
            label="Platform"
            required
            rules={{ required: 'Platform is required' }}
            options={PLATFORMS.map((p) => ({ label: p, value: p }))}
            fullWidth
            size="small"
            sx={{ minWidth: 0 }}
          />
        </Box>

        <Box sx={{ gridColumn: 'span 12', minWidth: 0 }}>
          <RHFTextField name="caption" label="Caption" multiline minRows={3} fullWidth size="small" sx={{ minWidth: 0 }} />
        </Box>

        <Box sx={{ gridColumn: 'span 12', minWidth: 0 }}>
          <RHFTextField name="hashtags" label="Hashtags" multiline minRows={2} fullWidth size="small" sx={{ minWidth: 0 }} />
        </Box>

        <Box sx={{ gridColumn: 'span 12', minWidth: 0 }}>
          <RHFTextField name="imagePath" label="Image Path" placeholder="/uploads/social/…" fullWidth size="small" sx={{ minWidth: 0 }} />
        </Box>

        <Box sx={{ gridColumn: { xs: 'span 12', sm: 'span 6' }, minWidth: 0 }}>
          <RHFTextField name="utmSource" label="UTM Source" fullWidth size="small" sx={{ minWidth: 0 }} />
        </Box>
        <Box sx={{ gridColumn: { xs: 'span 12', sm: 'span 6' }, minWidth: 0 }}>
          <RHFTextField name="utmMedium" label="UTM Medium" fullWidth size="small" sx={{ minWidth: 0 }} />
        </Box>

        <Box sx={{ gridColumn: 'span 12', minWidth: 0 }}>
          <RHFTextField name="utmCampaign" label="UTM Campaign" fullWidth size="small" sx={{ minWidth: 0 }} />
        </Box>
      </>
    </RHFForm>
  );
}