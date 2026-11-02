import * as React from 'react';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import api from '../api';
import { buildWhatsappText, copyText, getSafeUrl, normalizeUnit } from './unitsModel';

function Detail({ label, value, mapsUrl = '' }) {
  const displayValue = String(value || '').trim() || '–';
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 1, py: 0.9 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 10.5, lineHeight: 1.2 }}>
          {label}
        </Typography>
        <Typography sx={{ color: '#233936', fontSize: 14, fontWeight: 700, overflowWrap: 'anywhere' }}>
          {displayValue}
        </Typography>
      </Box>
      {mapsUrl ? (
        <IconButton
          size="small"
          component="a"
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Abrir en Google Maps"
          sx={{ color: '#1E6F68' }}
        >
          <PlaceOutlinedIcon />
        </IconButton>
      ) : null}
    </Box>
  );
}

function SectionTitle({ children, sx }) {
  return <Typography sx={{ color: '#1E6F68', fontSize: 12, fontWeight: 850, ...sx }}>{children}</Typography>;
}

function UnitCard({ unit }) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    setCopied(false);
  }, [unit.id]);

  const handleCopy = async () => {
    try {
      await copyText(buildWhatsappText(unit));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      setCopied(false);
    }
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 2, borderColor: '#d8e3e0' }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ color: '#173f3b', fontSize: 17, fontWeight: 850, overflowWrap: 'anywhere' }}>
              {unit.unitName}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" color="text.secondary">{unit.city || '–'}</Typography>
              {unit.status.toLowerCase() === 'onboarding' ? (
                <Chip size="small" label="Onboarding" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
              ) : null}
            </Stack>
          </Box>
          <IconButton
            onClick={handleCopy}
            aria-label="Copiar información para WhatsApp"
            title="Copiar para WhatsApp"
            sx={{ color: copied ? '#2f8f62' : '#1E6F68', border: '1px solid', borderColor: 'divider' }}
          >
            {copied ? <CheckRoundedIcon /> : <ContentCopyRoundedIcon />}
          </IconButton>
        </Box>

        <SectionTitle>UBICACIÓN</SectionTitle>
        <Detail label="Condominio" value={unit.condoName} mapsUrl={getSafeUrl(unit.condoGoogleMaps)} />
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 2 }}>
          <Detail label="Número de unidad" value={unit.unitNumber} />
          <Detail label="Piso" value={unit.unitFloor} />
        </Box>
        <Divider sx={{ my: 0.75 }} />

        <SectionTitle sx={{ mt: 1 }}>ACCESO</SectionTitle>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 2 }}>
          <Detail label="Tipo" value={unit.accessType} />
          <Detail label="Código" value={unit.accessCode} />
        </Box>
        <Detail label="Código del condominio" value={unit.condoDoorCode} />
        <Divider sx={{ my: 0.75 }} />

        <SectionTitle sx={{ mt: 1 }}>WI-FI</SectionTitle>
        <Detail label="Red" value={unit.wifiName} />
        <Detail label="Contraseña" value={unit.wifiPassword} />
      </CardContent>
    </Card>
  );
}

export default function MobileV2Units() {
  const [units, setUnits] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [selected, setSelected] = React.useState(null);

  React.useEffect(() => {
    let active = true;
    async function loadUnits() {
      try {
        const response = await api.get('/api/mobile/units-access');
        if (!active) return;
        setUnits((Array.isArray(response.data) ? response.data : []).map(normalizeUnit));
      } catch (requestError) {
        if (active) setError('No pudimos cargar las unidades. Intenta nuevamente.');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadUnits();
    return () => { active = false; };
  }, []);

  return (
    <Stack spacing={1.25} sx={{ minWidth: 0 }}>
      <Typography component="h1" variant="h5" sx={{ color: '#173f3b', fontWeight: 800 }}>
        Unidades
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      {loading ? (
        <Skeleton variant="rounded" height={56} />
      ) : (
        <Autocomplete
          fullWidth
          size="small"
          options={units}
          value={selected}
          onChange={(_, unit) => setSelected(unit)}
          getOptionLabel={(unit) => `${unit.unitName}${unit.city ? ` · ${unit.city}` : ''}`}
          isOptionEqualToValue={(option, value) => String(option.id) === String(value.id)}
          noOptionsText="No encontramos esa unidad"
          clearText="Limpiar"
          openText="Ver unidades"
          closeText="Cerrar"
          renderInput={(params) => (
            <TextField
              {...params}
              label="Unidad"
              placeholder="Escribe para buscar"
              inputProps={{ ...params.inputProps, autoComplete: 'off' }}
            />
          )}
        />
      )}

      {selected ? (
        <UnitCard unit={selected} />
      ) : (
        !loading && !error && (
          <Typography variant="body2" color="text.secondary">
            Busca una unidad para ver su información de acceso.
          </Typography>
        )
      )}
    </Stack>
  );
}
