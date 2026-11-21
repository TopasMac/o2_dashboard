import React from 'react';
import { IdentificationIcon, SparklesIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/solid';

export default function ServiceJobIcon({ job, size = 20 }) {
  let Icon = WrenchScrewdriverIcon;
  let color = '#4c5964';
  if (job.categoryId === 8) {
    Icon = SparklesIcon;
    color = '#2563a6';
  } else if (job.categoryName === 'Servicios Externos') {
    Icon = IdentificationIcon;
    color = '#0f766e';
  }
  return <Icon aria-hidden="true" style={{ display: 'block', flexShrink: 0, width: size, height: size, color }} />;
}
