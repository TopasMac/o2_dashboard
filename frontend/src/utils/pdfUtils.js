import pdfMake from 'pdfmake/build/pdfmake';
import * as pdfFonts from 'pdfmake/build/vfs_fonts';

pdfMake.vfs = pdfFonts.default?.pdfMake?.vfs || pdfFonts.pdfMake?.vfs;

export const generateHoaReportPdf = (hoaGroups, month, year) => {
  const monthName = new Date(2000, month - 1).toLocaleString('default', { month: 'long' });

  const content = [
    { text: `🏢 HOA Payments Report — ${monthName} ${year}`, style: 'header', margin: [0, 0, 0, 20] }
  ];

  hoaGroups.forEach(([condoName, units]) => {
    content.push(
      { text: `Condo Name: ${condoName}`, style: 'subheader', margin: [0, 10, 0, 5] },
      {
        table: {
          widths: ['auto', '*'],
          body: [
            [
              { text: `Bank:`, bold: true },
              { text: `${units[0].condo?.hoaBank || ''}` }
            ],
            [
              { text: `Account Name:`, bold: true },
              { text: `${units[0].condo?.hoaAccountName || ''}` }
            ],
            [
              { text: `Account Number:`, bold: true },
              { text: `${units[0].condo?.hoaAccountNr || ''}` }
            ]
          ]
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 5]
      },
      {
        table: {
          widths: ['*', '*', '*'],
          body: [
            [
              { text: 'Unit', bold: true },
              { text: 'HOA Amount', bold: true },
              { text: 'City', bold: true }
            ],
            ...units.map(unit => [
              unit.unitName,
              `$${unit.hoaAmount?.toFixed(2)}`,
              unit.city
            ])
          ]
        },
        layout: 'noBorders'
      }
    );
  });

  const docDefinition = {
    content,
    styles: {
      header: { fontSize: 18, bold: true },
      subheader: { fontSize: 14, bold: true, color: '#333' },
    },
    defaultStyle: { fontSize: 11 }
  };

  pdfMake.createPdf(docDefinition).open();
};