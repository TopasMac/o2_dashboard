import React, { useMemo, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Box, Button, Divider } from '@mui/material';
import RHFForm from './rhf/RHFForm';
import RHFSelect from './rhf/RHFSelect';
import RHFTextField from './rhf/RHFTextField';
import RHFCheckbox from './rhf/RHFCheckbox';
import { widthMap } from './rhf/widthMap';
import { useForm } from 'react-hook-form';
import { suggestByTag } from '../../utils/mediaTextSuggestions';

const FULL = (widthMap && widthMap.full) ? widthMap.full : '1 / -1';
const HALF = (widthMap && widthMap.half) ? widthMap.half : 'span 6';
const FULL_IMPORTANT = typeof FULL === 'string' ? `${FULL} !important` : FULL;
const HALF_IMPORTANT = typeof HALF === 'string' ? `${HALF} !important` : HALF;


/**
 * UnitMediaFormRHF
 * Lightweight RHF form for editing a single UnitMedia item.
 *
 * Props:
 *  - media:          the selected media object (from /api/unit_media/:id)
 *  - onSave(payload): called with PATCH-ready payload { tags:[], caption, seoDescription, isPublished, isCover }
 *  - onCancel():      optional, close the drawer
 *  - saving:         boolean to disable controls while saving
 */
export default function UnitMediaFormRHF({ media, onSave, onCancel, saving = false }) {
  const unitTags = ['balcony', 'bathroom', 'bedroom', 'bedroom master', 'dining', 'kitchen', 'living', 'plunge pool'].sort((a, b) => a.localeCompare(b));
  const commonTags = ['gym', 'exterior', 'rooftop pool', 'pool', 'front desk'].sort((a, b) => a.localeCompare(b));

  const defaults = useMemo(
    () => ({
      area: media?.area || 'Unit',
      tag: Array.isArray(media?.tags) && media.tags.length > 0 ? media.tags[0] : '',
      caption: media?.caption || '',
      seoDescription: media?.seoDescription || '',
      captionEs: media?.captionEs || '',
      seoDescriptionEs: media?.seoDescriptionEs || '',
      isPublished: !!media?.isPublished,
      isCover: !!media?.isCover,
    }),
    [media]
  );

  const methods = useForm({ defaultValues: defaults, mode: 'onChange' });
  const areaValue = methods.watch('area');
  const initialTagRef = useRef(defaults.tag || '');
  const tagOptions = useMemo(() => (areaValue === 'Common' ? commonTags : unitTags), [areaValue]);

  const tagValue = methods.watch('tag');
  const { dirtyFields } = methods.formState;

useEffect(() => {
  if (!tagValue) return;
  // Skip on initial mount/reset — only act when the user actually changes Tag
  if (tagValue === initialTagRef.current) return;

  // EN suggestions
  const { caption, seo } = suggestByTag(tagValue, {
    unitName: media?.unitName,
    city: media?.city,
  });
  methods.setValue('caption', caption || '', { shouldDirty: false, shouldValidate: false });
  methods.setValue('seoDescription', seo || '', { shouldDirty: false, shouldValidate: false });

  // ES suggestions
  const { caption: capEs, seo: seoEs } = suggestByTag(tagValue, {
    unitName: media?.unitName,
    city: media?.city,
    lang: 'es',
  });
  methods.setValue('captionEs', capEs || '', { shouldDirty: false, shouldValidate: false });
  methods.setValue('seoDescriptionEs', seoEs || '', { shouldDirty: false, shouldValidate: false });

  // Reset dirty state so ES fields hide and reflect the new defaults
  methods.resetField('caption', { defaultValue: caption || '' });
  methods.resetField('seoDescription', { defaultValue: seo || '' });
  methods.resetField('captionEs', { defaultValue: capEs || '' });
  methods.resetField('seoDescriptionEs', { defaultValue: seoEs || '' });
}, [tagValue, methods, media]);

  // Keep ES fields in sync with Tag (unless user edited ES fields)
  useEffect(() => {
    if (!tagValue) return;
    const esCaptionDirty = methods.getFieldState('captionEs').isDirty;
    const esSeoDirty = methods.getFieldState('seoDescriptionEs').isDirty;

    if (!esCaptionDirty) {
      const { caption: capEs } = suggestByTag(tagValue, { unitName: media?.unitName, city: media?.city, lang: 'es' });
      methods.setValue('captionEs', capEs || '', { shouldDirty: false, shouldValidate: false });
    }
    if (!esSeoDirty) {
      const { seo: seoEs } = suggestByTag(tagValue, { unitName: media?.unitName, city: media?.city, lang: 'es' });
      methods.setValue('seoDescriptionEs', seoEs || '', { shouldDirty: false, shouldValidate: false });
    }
  }, [tagValue, methods, media]);

  useEffect(() => {
    const tag = methods.getValues('tag');
    if (!tag) return;

    // If user has edited the ES caption, never auto-overwrite it
    const esDirty = !!methods.formState?.dirtyFields?.captionEs;

    // Trigger when EN Caption becomes dirty OR Tag changes
    if (dirtyFields?.caption || tagValue) {
      if (!esDirty) {
        const { caption: capEs } = suggestByTag(tag, { unitName: media?.unitName, city: media?.city, lang: 'es' });
        methods.setValue('captionEs', capEs || '', { shouldDirty: false, shouldValidate: false });
      }
    }
  }, [dirtyFields?.caption, tagValue, methods, media]);

  useEffect(() => {
    const tag = methods.getValues('tag');
    if (!tag) return;

    // If user has edited the ES SEO, never auto-overwrite it
    const esDirty = !!methods.formState?.dirtyFields?.seoDescriptionEs;

    // Trigger when EN SEO becomes dirty OR Tag changes
    if (dirtyFields?.seoDescription || tagValue) {
      if (!esDirty) {
        const { seo: seoEs } = suggestByTag(tag, { unitName: media?.unitName, city: media?.city, lang: 'es' });
        methods.setValue('seoDescriptionEs', seoEs || '', { shouldDirty: false, shouldValidate: false });
      }
    }
  }, [dirtyFields?.seoDescription, tagValue, methods, media]);

  // keep form in sync when a different media is selected
  useEffect(() => {
    methods.reset(defaults);
    initialTagRef.current = defaults.tag || '';
  }, [defaults, methods]);

  const handleSubmit = (values) => {
    let capEs = values.captionEs;
    let seoEs = values.seoDescriptionEs;

    if (!capEs || !seoEs) {
      const { caption: capAuto, seo: seoAuto } = suggestByTag(values.tag, { unitName: media?.unitName, city: media?.city, lang: 'es' });
      if (!capEs) capEs = capAuto || '';
      if (!seoEs) seoEs = seoAuto || '';
    }

    const payload = {
      tags: values.tag ? [values.tag] : [],
      caption: values.caption || '',
      seoDescription: values.seoDescription || '',
      captionEs: capEs,
      seoDescriptionEs: seoEs,
      isPublished: !!values.isPublished,
      isCover: !!values.isCover,
    };
    onSave && onSave(payload);
  };

  return (
    <RHFForm methods={methods} onSubmit={handleSubmit}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 2,
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
          overflowX: 'hidden',
          gridAutoFlow: 'row',
          '& > *': { minWidth: 0 }
        }}
      >
        {/* URL Preview (readonly) */}
        {media?.url && (
          <Box sx={{ fontSize: 12, color: '#666', gridColumn: FULL_IMPORTANT, minWidth: 0, overflowWrap: 'anywhere' }}>
            <div>
              <strong>URL:</strong>{' '}
              <a
                href={media.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-block',
                  maxWidth: '100%',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word',
                  whiteSpace: 'normal'
                }}
              >
                {media.url}
              </a>
            </div>
          </Box>
        )}

        {/* Row: Area + Tag (two columns) */}
        <Box sx={{ gridColumn: FULL_IMPORTANT, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, minWidth: 0 }}>
          <Box sx={{ minWidth: 0 }}>
            <RHFSelect name="area" label="Area" options={["Unit","Common"]} fullWidth />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <RHFSelect name="tag" label="Tag" options={tagOptions} fullWidth />
          </Box>
        </Box>

        {/* Caption */}
        <Box sx={{ minWidth: 0, gridColumn: FULL_IMPORTANT }}>
          <RHFTextField name="caption" label="Caption" placeholder="Short caption" fullWidth />
        </Box>
        {dirtyFields?.caption && (
          <Box sx={{ minWidth: 0, gridColumn: FULL_IMPORTANT }}>
            <RHFTextField name="captionEs" label="Caption (ES)" placeholder="Subtítulo en español" fullWidth />
          </Box>
        )}

        {/* SEO Description */}
        <Box sx={{ minWidth: 0, gridColumn: FULL_IMPORTANT }}>
          <RHFTextField
            name="seoDescription"
            label="SEO Description"
            placeholder="Search-friendly description"
            fullWidth
            multiline
            minRows={3}
          />
        </Box>
        {dirtyFields?.seoDescription && (
          <Box sx={{ minWidth: 0, gridColumn: FULL_IMPORTANT }}>
            <RHFTextField name="seoDescriptionEs" label="SEO (ES)" placeholder="Descripción de búsqueda en español" fullWidth multiline minRows={3} />
          </Box>
        )}

        {/* Flags */}
        <Box sx={{ minWidth: 0, gridColumn: FULL_IMPORTANT }}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <RHFCheckbox name="isPublished" label="Published" />
            <RHFCheckbox name="isCover" label="Cover" />
          </Box>
        </Box>

        <Box sx={{ minWidth: 0, gridColumn: FULL_IMPORTANT }}>
          <Divider />
        </Box>

        {/* Actions */}
        <Box
          sx={{
            minWidth: 0,
            gridColumn: FULL_IMPORTANT,
            display: 'flex',
            gap: 1,
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
            alignItems: 'center',
            '& > *': { minWidth: 0 }
          }}
        >
          <Button
            variant="outlined"
            color="error"
            onClick={() => onSave && onSave({ delete: true })}
            disabled={saving}
          >
            Delete
          </Button>
          <Button type="submit" variant="contained" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </Box>
      </Box>
    </RHFForm>
  );
}

UnitMediaFormRHF.propTypes = {
  media: PropTypes.object,
  onSave: PropTypes.func,
  onCancel: PropTypes.func,
  saving: PropTypes.bool,
};