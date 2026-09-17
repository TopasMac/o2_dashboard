import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded';
import { MOBILE_FEATURE_LIST } from './mobileFeatures';

export default function MobileV2Home() {
  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 750, color: '#173f3b' }}>
          Mobile V2
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
          Nueva experiencia móvil de HausIn.
        </Typography>
      </Box>

      <Card variant="outlined" sx={{ borderColor: '#b9d6d1', bgcolor: '#f9fffd' }}>
        <CardContent sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
          <AdminPanelSettingsRoundedIcon sx={{ color: '#1E6F68', mt: 0.25 }} />
          <Box>
            <Typography sx={{ fontWeight: 700 }}>Acceso inicial: administrador</Typography>
            <Typography variant="body2" color="text.secondary">
              Los módulos usarán permisos individuales para habilitar posteriormente el acceso del asociado y del personal.
            </Typography>
          </Box>
        </CardContent>
      </Card>

      <Box>
        <Typography variant="overline" sx={{ color: '#1E6F68', fontWeight: 800 }}>
          Plan de módulos
        </Typography>
        <Stack spacing={1.25} sx={{ mt: 0.5 }}>
          {MOBILE_FEATURE_LIST.map((feature) => (
            <Card key={feature.id} variant="outlined" sx={{ borderColor: '#dfe8e5' }}>
              <CardContent sx={{ '&:last-child': { pb: 2 }, py: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography sx={{ flex: 1, fontWeight: 700 }}>{feature.label}</Typography>
                  <Chip
                    size="small"
                    label={feature.id === 'dashboard' ? 'Siguiente' : 'Planificado'}
                    color={feature.id === 'dashboard' ? 'primary' : 'default'}
                    variant={feature.id === 'dashboard' ? 'filled' : 'outlined'}
                  />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {feature.description}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}
