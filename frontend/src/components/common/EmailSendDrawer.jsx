import React from 'react';
import Drawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { FormProvider, useForm } from 'react-hook-form';
import { RHFTextField } from '../forms/rhf/RHFForm';

// Helpers to show HTML with real newlines in the textarea, but send HTML on submit
const htmlToText = (html) => {
  try {
    return String(html ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/<br\s*\/?>/gi, '\n');
  } catch {
    return String(html ?? '');
  }
};
const textToHtml = (text) => {
  try {
    return String(text ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\n/g, '<br/>');
  } catch {
    return String(text ?? '');
  }
};

// Helper to infer filename from a URL
const inferFileName = (url) => {
  try {
    if (!url) return '';
    const u = String(url);
    const last = u.split('?')[0].split('/').pop();
    return last || u;
  } catch {
    return String(url || '');
  }
};

/**
 * EmailSendDrawer
 * @param {object} props
 * @param {boolean} props.open - Whether the drawer is open.
 * @param {function} props.onClose - Called to close the drawer.
 * @param {function} props.onSubmit - Called with form values on submit.
 * @param {object} props.initialValues - { to, cc, subject, htmlBody, attachments }
 */
const EmailSendDrawer = ({
  open,
  onClose,
  onSubmit,
  initialValues,
}) => {
  // Normalize incoming values (null-safe) and support multiple alias keys
  const init = initialValues || {};
  // Build attachments from s3_url/s3Url only when the relevant inputs change
  const attachmentsFromS3 = React.useMemo(() => {
    const s3UrlSingle = init.s3_url || init.s3Url || null;
    if (!Array.isArray(init.attachments) || init.attachments.length === 0) {
      return s3UrlSingle ? [{ name: inferFileName(s3UrlSingle), url: s3UrlSingle }] : [];
    }
    return [];
  }, [init.attachments, init.s3_url, init.s3Url]);
  const normalizedDefaults = React.useMemo(() => ({
    category: init.category ?? 'MONTH_REPORT',
    unitId: init.unitId,
    clientId: init.clientId,
    transactionId: init.transactionId,
    yearMonth: init.yearMonth,
    serviceName: init.serviceName,
    to: init.to ?? init.toEmail ?? '',
    cc: init.cc ?? init.ccEmail ?? '',
    subject: init.subject ?? '',
    htmlBody: htmlToText(init.htmlBody ?? init.body ?? ''),
    attachments: Array.isArray(init.attachments) && init.attachments.length > 0 ? init.attachments : attachmentsFromS3,
  }), [init, attachmentsFromS3]);
  const { to, cc, subject, htmlBody, attachments } = normalizedDefaults;

  const methods = useForm({
    defaultValues: normalizedDefaults,
  });

  React.useEffect(() => {
    if (open) {
      methods.reset({ ...normalizedDefaults, htmlBody: htmlToText(normalizedDefaults.htmlBody) });
    }
    // We only reset when drawer opens or when initialValues identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialValues, normalizedDefaults]);

  const handleLocalSubmit = (values) => {
    const payload = {
      ...normalizedDefaults,
      ...values,
      htmlBody: textToHtml(values.htmlBody),
      attachments: values.attachments ?? attachments,
    };
    if (typeof onSubmit === 'function') {
      onSubmit(payload);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 500 } } }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ px: 3, py: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6" component="div">
            Send Email
          </Typography>
        </Box>
        <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2 }}>
          <FormProvider {...methods}>
            <form onSubmit={methods.handleSubmit(handleLocalSubmit)}>
              <Stack spacing={2}>
                <RHFTextField
                  name="to"
                  label="To"
                  required
                  fullWidth
                  autoFocus
                />
                <RHFTextField
                  name="cc"
                  label="CC"
                  fullWidth
                />
                <RHFTextField
                  name="subject"
                  label="Subject"
                  required
                  fullWidth
                />
                <RHFTextField
                  name="htmlBody"
                  label="Message"
                  multiline
                  minRows={5}
                  fullWidth
                />
                {attachments && attachments.length > 0 && (
                  <Box>
                    <Typography variant="subtitle2" gutterBottom>
                      Attachments
                    </Typography>
                    <Stack spacing={1}>
                      {attachments.map((att, idx) => (
                        <Box key={idx}>
                          {att.url ? (
                            <a href={att.url} target="_blank" rel="noopener noreferrer">
                              {att.name || att.url}
                            </a>
                          ) : (
                            <Typography variant="body2">{att.name}</Typography>
                          )}
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                )}
              </Stack>
              {/* Footer bar */}
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 2,
                  pt: 3,
                  pb: 1,
                  mt: 4,
                  borderTop: 1,
                  borderColor: 'divider',
                  position: 'sticky',
                  bottom: 0,
                  backgroundColor: 'background.paper',
                }}
              >
                <Button onClick={onClose} color="inherit" variant="text">
                  Cancel
                </Button>
                <Button type="submit" variant="contained">
                  Send
                </Button>
              </Box>
            </form>
          </FormProvider>
        </Box>
      </Box>
    </Drawer>
  );
};

export default EmailSendDrawer;