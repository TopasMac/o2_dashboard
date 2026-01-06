<?php

namespace App\Service;

use App\Entity\SantanderEntry;
use App\Repository\SantanderEntryRepository;
use Doctrine\ORM\EntityManagerInterface;
use PhpOffice\PhpSpreadsheet\IOFactory;

/**
 * Imports Santander bank statements (XLSX) into santander_entry.
 *
 * For v1 we focus mainly on credit (Deposito) rows, but we also persist
 * Retiro if present so the table can be reused for other views.
 *
 * Import is idempotent at the "entry" level using a simple fingerprint:
 *  (fechaOn, concept, deposito, accountLast4)
 */
class SantanderBankImportService
{
    private EntityManagerInterface $em;
    private SantanderEntryRepository $repo;

    public function __construct(EntityManagerInterface $em, SantanderEntryRepository $repo)
    {
        $this->em   = $em;
        $this->repo = $repo;
    }

    /**
     * Import a Santander XLSX file.
     *
     * @param string      $path           Full filesystem path to the uploaded XLSX.
     * @param string|null $accountLast4   Optional account suffix, e.g. "2825".
     * @param string|null $sourceFileName Original file name for traceability.
     *
     * @return array{batches:int,items:int,created:int,updated:int}
     */
    public function importFile(string $path, ?string $accountLast4 = null, ?string $sourceFileName = null): array
    {
        $spreadsheet = IOFactory::load($path);
        $sheet       = $spreadsheet->getActiveSheet();

        // Detect header row: look for a row that has columns containing "fecha", "concepto"
        // and "deposito"/"depósito" (case-insensitive, substring match).
        $headerRowIndex = null;
        $headers        = [];

        $highestRow    = $sheet->getHighestRow();
        $highestColumn = $sheet->getHighestColumn();
        $highestColIdx = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::columnIndexFromString($highestColumn);

        for ($row = 1; $row <= min($highestRow, 10); $row++) {
            $rowHeaders = [];
            for ($col = 1; $col <= $highestColIdx; $col++) {
                $colLetter = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($col);
                $cellAddr  = $colLetter . $row;
                $val       = $sheet->getCell($cellAddr)->getValue();
                if (!is_string($val)) {
                    continue;
                }
                $h = mb_strtolower(trim($val));

                if ($h === '') {
                    continue;
                }

                if (str_contains($h, 'fecha') && !isset($rowHeaders['fecha'])) {
                    $rowHeaders['fecha'] = $col;
                } elseif ((str_contains($h, 'concepto') || str_contains($h, 'concept')) && !isset($rowHeaders['concepto'])) {
                    $rowHeaders['concepto'] = $col;
                } elseif (str_contains($h, 'retiro') && !isset($rowHeaders['retiro'])) {
                    $rowHeaders['retiro'] = $col;
                } elseif (
                    (str_contains($h, 'deposito') || str_contains($h, 'depósito') || str_contains($h, 'dep\u00f3sito'))
                    && !isset($rowHeaders['deposito'])
                ) {
                    $rowHeaders['deposito'] = $col;
                } elseif (str_contains($h, 'hora') && !isset($rowHeaders['hora'])) {
                    $rowHeaders['hora'] = $col;
                } elseif (str_contains($h, 'moneda') && !isset($rowHeaders['moneda'])) {
                    $rowHeaders['moneda'] = $col;
                }
            }

            // We consider this row the header if it has at least fecha + concepto + deposito.
            if (isset($rowHeaders['fecha'], $rowHeaders['concepto'], $rowHeaders['deposito'])) {
                $headerRowIndex = $row;
                $headers        = $rowHeaders;
                break;
            }
        }

        if ($headerRowIndex === null) {
            // No recognizable header row; nothing to import.
            return [
                'batches' => 0,
                'items'   => 0,
                'created' => 0,
                'updated' => 0,
            ];
        }

        $created = 0;
        $updated = 0;
        $items   = 0;

        // Iterate data rows after header
        for ($row = $headerRowIndex + 1; $row <= $highestRow; $row++) {
            $cell = static function (string $header) use ($sheet, $headers, $row) {
                $key = mb_strtolower($header);
                if (!isset($headers[$key])) {
                    return null;
                }
                $colIdx    = $headers[$key];
                $colLetter = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($colIdx);
                $cellAddr  = $colLetter . $row;
                $value     = $sheet->getCell($cellAddr)->getValue();
                return is_string($value) ? trim($value) : $value;
            };

            $fechaStr   = $cell('fecha');
            $conceptStr = $cell('concepto');
            $retiroStr  = $cell('retiro');
            $depositoStr = $cell('deposito') ?? $cell('depósito');
            $horaStr    = $cell('hora');
            $monedaStr  = $cell('moneda');

            // Skip completely empty rows
            if ($fechaStr === null && $conceptStr === null && $depositoStr === null && $retiroStr === null) {
                continue;
            }

            // Parse date
            $fechaOn = null;
            if ($fechaStr !== null && $fechaStr !== '') {
                // Handle either spreadsheet date (numeric) or string DD/MM/YYYY
                if (is_numeric($fechaStr)) {
                    $fechaOn = \PhpOffice\PhpSpreadsheet\Shared\Date::excelToDateTimeObject((float)$fechaStr);
                } else {
                    $rawFecha = (string) $fechaStr;
                    $rawLower = mb_strtolower($rawFecha);

                    // Map common Spanish month abbreviations (and some variants) to numeric month.
                    $monthMap = [
                        'ene' => '01',
                        'feb' => '02',
                        'mar' => '03',
                        'abr' => '04',
                        'may' => '05',
                        'jun' => '06',
                        'jul' => '07',
                        'ago' => '08',
                        'sep' => '09',
                        'set' => '09', // sometimes used
                        'oct' => '10',
                        'nov' => '11',
                        'dic' => '12',
                    ];

                    foreach ($monthMap as $abbr => $num) {
                        // Replace month abbreviation between slashes, e.g. "05/dic/25" -> "05/12/25"
                        $rawLower = preg_replace(
                            sprintf('/(\\d{1,2})\\/%s\\/(\\d{2,4})/u', $abbr),
                            '$1/' . $num . '/$2',
                            $rawLower
                        );
                    }

                    $fechaStrNorm = str_replace(['.', '-'], '/', $rawLower);
                    $fechaOn = null;

                    // If the normalized date clearly has a 2-digit year (e.g. 05/01/25), parse it as such.
                    // Important: `createFromFormat('d/m/Y', '05/01/25')` can succeed and yield year 0025,
                    // so we must detect + handle 2-digit years explicitly.
                    if (preg_match('/^\s*\d{1,2}\/\d{1,2}\/(\d{2})\s*$/', $fechaStrNorm, $m)) {
                        $dt2 = \DateTimeImmutable::createFromFormat('d/m/y', $fechaStrNorm);
                        if ($dt2 instanceof \DateTimeImmutable) {
                            $yy = (int) $dt2->format('y');
                            $mm = (int) $dt2->format('m');
                            $dd = (int) $dt2->format('d');

                            // Pivot: 00–69 => 2000–2069, 70–99 => 1970–1999
                            $fullYear = ($yy <= 69) ? (2000 + $yy) : (1900 + $yy);

                            $fechaOn = \DateTimeImmutable::createFromFormat(
                                'Y-m-d',
                                sprintf('%04d-%02d-%02d', $fullYear, $mm, $dd)
                            );
                        }
                    } else {
                        // Prefer 4-digit year parsing when present
                        $fechaOn = \DateTimeImmutable::createFromFormat('d/m/Y', $fechaStrNorm);

                        // Guard against accidental 00xx years if the parser accepted a 2-digit year under 'Y'
                        if ($fechaOn instanceof \DateTimeImmutable && (int) $fechaOn->format('Y') < 1900) {
                            $fechaOn = null;
                        }

                        if (!$fechaOn) {
                            // Fallback: try 2-digit year + pivot
                            $dt2 = \DateTimeImmutable::createFromFormat('d/m/y', $fechaStrNorm);
                            if ($dt2 instanceof \DateTimeImmutable) {
                                $yy = (int) $dt2->format('y');
                                $mm = (int) $dt2->format('m');
                                $dd = (int) $dt2->format('d');

                                $fullYear = ($yy <= 69) ? (2000 + $yy) : (1900 + $yy);

                                $fechaOn = \DateTimeImmutable::createFromFormat(
                                    'Y-m-d',
                                    sprintf('%04d-%02d-%02d', $fullYear, $mm, $dd)
                                );
                            }
                        }
                    }
                }
            }

            if (!$fechaOn instanceof \DateTimeInterface) {
                // If we can't parse date, skip row
                continue;
            }

            // Parse time (optional)
            $hora = null;
            if ($horaStr !== null && $horaStr !== '') {
                if (is_numeric($horaStr)) {
                    $dt = \PhpOffice\PhpSpreadsheet\Shared\Date::excelToDateTimeObject((float)$horaStr);
                    $hora = \DateTimeImmutable::createFromFormat('H:i:s', $dt->format('H:i:s'));
                } else {
                    $hora = \DateTimeImmutable::createFromFormat('H:i', (string)$horaStr)
                        ?: \DateTimeImmutable::createFromFormat('H:i:s', (string)$horaStr);
                }
            }

            // Normalize amounts (both retiro and deposito)
            $parseMoney = static function ($raw): ?string {
                if ($raw === null || $raw === '') {
                    return null;
                }
                if (is_numeric($raw)) {
                    return number_format((float)$raw, 2, '.', '');
                }
                $s = (string)$raw;
                $s = str_replace([' ', ','], ['', '.'], $s);
                $s = str_replace(['$', 'MXN', 'mxn'], '', $s);
                $s = trim($s);
                if ($s === '') {
                    return null;
                }
                if (!is_numeric($s)) {
                    return null;
                }
                return number_format((float)$s, 2, '.', '');
            };

            $retiro    = $parseMoney($retiroStr);
            $deposito  = $parseMoney($depositoStr);

            // If both retiro and deposito are null/zero, nothing interesting here.
            if ($retiro === null && $deposito === null) {
                continue;
            }

            $concept = $conceptStr !== null ? (string)$conceptStr : '';

            // For v1 we treat only credits as "items" to be displayed / reconciled.
            if ($deposito === null) {
                // We still could persist row (for completeness), but for now skip non-credit rows.
                continue;
            }

            $items++;

            $accountSuffix = $accountLast4 ?? $this->guessAccountLast4FromConcept($concept) ?? '';

            // Idempotent lookup
            $existing = $this->repo->findExistingByFingerprint($fechaOn, $concept, $deposito, $accountSuffix ?: null);

            if ($existing instanceof SantanderEntry) {
                $existing
                    ->setHora($hora)
                    ->setRetiro($retiro)
                    ->setMoneda($monedaStr !== null ? (string)$monedaStr : null)
                    ->setSourceFileName($sourceFileName)
                    ->setUpdatedAt(new \DateTimeImmutable());

                if ($accountSuffix !== '' && $existing->getAccountLast4() !== $accountSuffix) {
                    $existing->setAccountLast4($accountSuffix);
                }

                $updated++;
            } else {
                $entry = new SantanderEntry();
                $entry
                    ->setAccountLast4($accountSuffix !== '' ? $accountSuffix : '0000')
                    ->setFechaOn($fechaOn)
                    ->setHora($hora)
                    ->setConcept($concept)
                    ->setRetiro($retiro)
                    ->setDeposito($deposito)
                    ->setMoneda($monedaStr !== null ? (string)$monedaStr : null)
                    ->setSourceFileName($sourceFileName);

                $this->em->persist($entry);
                $created++;
            }
        }

        if ($created > 0 || $updated > 0) {
            $this->em->flush();
        }

        return [
            'batches' => $items > 0 ? 1 : 0,
            'items'   => $items,
            'created' => $created,
            'updated' => $updated,
        ];
    }

    /**
     * Try to guess the account suffix (last 4 digits) from the title or concept lines,
     * e.g. "Detalle del 06-09-25 al 05-12-25 de la cuenta *2825".
     */
    private function guessAccountLast4FromConcept(?string $concept): ?string
    {
        if ($concept === null) {
            return null;
        }

        if (preg_match('/\*([0-9]{4})/', $concept, $m)) {
            return $m[1];
        }

        return null;
    }
}
