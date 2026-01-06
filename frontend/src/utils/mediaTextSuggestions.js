// frontend/src/utils/mediaTextSuggestions.js
const EN = {
    unit: {
      balcony: {
        caption: 'Cozy balcony with open-air seating',
        seo: (ctx) => `Private balcony with seating—perfect for morning coffee and evening breeze${loc(ctx)}.`,
      },
      bedroom: {
        caption: 'Comfy king bed, blackout curtains',
        seo: (ctx) => `Spacious bedroom with king bed, premium linens, and blackout curtains for restful sleep${loc(ctx)}.`,
      },
      'bedroom master': {
        caption: 'Primary bedroom with king bed',
        seo: (ctx) => `Primary (master) bedroom with king bed, premium linens, and blackout curtains for restful sleep${loc(ctx)}.`,
      },
      bathroom: {
        caption: 'Spotless bathroom with rain shower',
        seo: (ctx) => `Clean modern bathroom featuring a rain shower, fresh towels, and essential amenities${loc(ctx)}.`,
      },
      dining: {
        caption: 'Dining corner for 2–4 guests',
        seo: (ctx) => `Bright dining area ideal for work or meals, seating for up to four${loc(ctx)}.`,
      },
      kitchen: {
        caption: 'Equipped kitchenette, ready to cook',
        seo: (ctx) => `Kitchenette stocked with cookware, fridge, and stovetop—great for longer stays${loc(ctx)}.`,
      },
      living: {
        caption: 'Bright living room with sofa',
        seo: (ctx) => `Comfortable living area with sofa and smart TV for relaxing evenings${loc(ctx)}.`,
      },
      'plunge pool': {
        caption: 'Private plunge pool to unwind',
        seo: (ctx) => `Chic private plunge pool—cool down and relax after the beach${loc(ctx)}.`,
      },
    },
    common: {
      gym: {
        caption: 'On-site gym, free access',
        seo: (ctx) => `Well-equipped condominium gym with cardio and weights for daily workouts${loc(ctx)}.`,
      },
      exterior: {
        caption: 'Modern façade & entrance',
        seo: (ctx) => `Secure entrance and stylish exterior with easy access and good lighting${loc(ctx)}.`,
      },
      'rooftop pool': {
        caption: 'Rooftop pool with views',
        seo: (ctx) => `Rooftop infinity pool with loungers and panoramic city views${loc(ctx)}.`,
      },
      pool: {
        caption: 'Ground pool & loungers',
        seo: (ctx) => `Large shared pool surrounded by loungers and shaded areas${loc(ctx)}.`,
      },
      'front desk': {
        caption: '24/7 front desk support',
        seo: (ctx) => `Concierge/front desk available for check-ins, local tips, and assistance${loc(ctx)}.`,
      },
    },
  };

const ES = {
  unit: {
    balcony: {
      caption: 'Balcón acogedor con asientos al aire libre',
      seo: (ctx) => `Balcón privado con asientos, ideal para el café de la mañana o disfrutar la brisa de la tarde${loc(ctx)}.`,
    },
    bedroom: {
      caption: 'Cama king cómoda y cortinas opacas',
      seo: (ctx) => `Amplio dormitorio con cama king, ropa de cama premium y cortinas opacas para un descanso reparador${loc(ctx)}.`,
    },
    'bedroom master': {
      caption: 'Dormitorio principal con cama king',
      seo: (ctx) => `Dormitorio principal con cama king, ropa de cama premium y cortinas opacas para un descanso reparador${loc(ctx)}.`,
    },
    bathroom: {
      caption: 'Baño impecable con regadera tipo lluvia',
      seo: (ctx) => `Baño moderno y limpio con regadera tipo lluvia, toallas frescas y artículos esenciales${loc(ctx)}.`,
    },
    dining: {
      caption: 'Comedor para 2–4 personas',
      seo: (ctx) => `Área de comedor luminosa, ideal para trabajar o comer, con capacidad para hasta cuatro personas${loc(ctx)}.`,
    },
    kitchen: {
      caption: 'Cocineta equipada, lista para usar',
      seo: (ctx) => `Cocineta equipada con utensilios, refrigerador y estufa, ideal para estancias largas${loc(ctx)}.`,
    },
    living: {
      caption: 'Sala luminosa con sofá',
      seo: (ctx) => `Sala cómoda con sofá y Smart TV para relajarse por las tardes${loc(ctx)}.`,
    },
    'plunge pool': {
      caption: 'Alberca privada para relajarse',
      seo: (ctx) => `Alberca privada tipo plunge, perfecta para refrescarse después de la playa${loc(ctx)}.`,
    },
  },
  common: {
    gym: {
      caption: 'Gimnasio en el condominio, acceso libre',
      seo: (ctx) => `Gimnasio bien equipado con máquinas de cardio y pesas${loc(ctx)}.`,
    },
    exterior: {
      caption: 'Fachada moderna y entrada segura',
      seo: (ctx) => `Entrada segura y fachada moderna con fácil acceso e iluminación adecuada${loc(ctx)}.`,
    },
    'rooftop pool': {
      caption: 'Alberca en la azotea con vista',
      seo: (ctx) => `Alberca infinita en la azotea con camastros y vistas panorámicas${loc(ctx)}.`,
    },
    pool: {
      caption: 'Alberca compartida con camastros',
      seo: (ctx) => `Amplia alberca compartida rodeada de camastros y áreas con sombra${loc(ctx)}.`,
    },
    'front desk': {
      caption: 'Recepción 24/7',
      seo: (ctx) => `Recepción disponible para check-ins, consejos locales y asistencia${loc(ctx)}.`,
    },
  },
};

function loc(ctx = {}) {
  const u = (ctx.unitName || '').trim();
  const c = (ctx.city || '').trim();
  const pre = ctx.lang === 'es' ? ' en ' : ' in ';
  if (u && c) return `${pre}${u}, ${c}`;
  if (u) return `${pre}${u}`;
  if (c) return `${pre}${c}`;
  return '';
}

function normalizeTag(tag = '') {
  return String(tag).trim().toLowerCase();
}

export function suggestByTag(tag, { unitName, city, locale, lang = 'en' } = {}) {
  const t = normalizeTag(tag);
  const dict = lang === 'es' ? ES : EN;
  const ctx = { unitName, city, locale, lang };

  const brandedTags = new Set(['living', 'bedroom', 'bedroom master', 'rooftop pool', 'balcony']);

  // Determine area bucket from the tag
  const unitTags = Object.keys(dict.unit);
  const commonTags = Object.keys(dict.common);

  let entry;
  if (unitTags.includes(t)) {
    entry = dict.unit[t];
  } else if (commonTags.includes(t)) {
    entry = dict.common[t];
  } else {
    // Fallback generic copy
    return {
      caption: lang === 'es' ? 'Detalle de la propiedad' : 'Property highlight',
      seo: (lang === 'es' ? 'Espacio cómodo con amenidades útiles' : 'Comfortable space with useful amenities') + `${loc(ctx)}.`,
    };
  }

  const caption = entry.caption;
  let seo = typeof entry.seo === 'function' ? entry.seo(ctx) : entry.seo;

  // System-controlled branding: append brand on selected hero tags (SEO only)
  if (brandedTags.has(t)) {
    const trimmed = (seo || '').trim();
    const withPeriod = trimmed.endsWith('.') ? trimmed : `${trimmed}.`;
    seo = `${withPeriod} Owners2 Rentals.`;
  }

  return { caption, seo };
}