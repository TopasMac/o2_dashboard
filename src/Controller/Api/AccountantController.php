<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Entity\AccountantEntry;
use App\Entity\AccountantImport;
use App\Repository\AccountantEntryRepository;
use DateTimeImmutable;
use Doctrine\ORM\EntityManagerInterface;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

final class AccountantController extends AbstractController
{
    /**
     * Import an accountant Excel/CSV. Supports dry-run with `?dryRun=1`.
     * - Ignores rows without a Fecha value
     * - Normalizes different Fecha formats (Spanish month names, Excel serials, dd/mm/yyyy)
     * - Only the DATE part is stored (no time)
     * - De-duplicates by row hash
     * - Smart-replaces existing active rows within the same groupKey (date+tipoMovimiento+tipoPago+concepto):
     *   - if values changed, previous row is marked inactive and superseded by the new one
     */
    #[Route('/api/imports/accountant', name: 'api_accountant_import_upload', methods: ['POST'])]
    public function upload(Request $request, EntityManagerInterface $em, AccountantEntryRepository $repo): Response
    {
        /** @var UploadedFile|null $file */
        $file = $request->files->get('file');
        $isDryRun = (bool) ((int) $request->query->get('dryRun', '0'));
        $debug = (bool) ((int) $request->query->get('debug', '0'));
        $debugInfo = [
            'headers' => [],
            'headerMap' => [],
            'samples' => [],
            'ratios' => ['median' => null, 'p90' => null, 'count' => 0],
        ];

        if (!$file instanceof UploadedFile || !$file->isValid()) {
            return new JsonResponse(['error' => 'No file or invalid upload'], 400);
        }

        $summary = [
            'dryRun' => $isDryRun,
            'filename' => $file->getClientOriginalName(),
            'rowsRead' => 0,
            'rowsWithNoDate' => 0,
            'unparsedDates' => 0,
            'inserted' => 0,
            'duplicates' => 0,
            'superseded' => 0,
            'changes' => [], // up to first few change summaries
        ];

        $allExistingRowHashes = $repo->loadAllRowHashes();
        $existingRowHashSet = array_fill_keys($allExistingRowHashes, true);

        // Parse the spreadsheet (XLSX/XLS/CSV)
        $ext = strtolower((string) $file->getClientOriginalExtension());
        if ($ext === 'csv') {
            [$headers, $rows] = $this->parseCsv($file->getPathname());
        } else {
            [$headers, $rows] = $this->parseSpreadsheet($file->getPathname());
        }
        if ($debug) { $debugInfo['headers'] = $headers; }

        // Map normalized headers to expected keys
        $map = $this->buildHeaderMap($headers);
        if ($debug) { $debugInfo['headerMap'] = $map; }

        // Optional import record (only when not dry-run)
        $import = null;
        if (!$isDryRun) {
            $import = (new AccountantImport())
                ->setFilename($file->getClientOriginalName())
                ->setUploadedAt(new DateTimeImmutable())
                ->setDryRun(false);
            $em->persist($import);
        }

        $sampled = 0;
        $ratiosArr = [];

        foreach ($rows as $rowIndex => $rowVals) {
            $summary['rowsRead']++;

            $rawFecha = $this->getCell($rowVals, $map, 'fecha');
            if ($rawFecha === null || trim((string)$rawFecha) === '') {
                $summary['rowsWithNoDate']++;
                continue; // ignore rows without date
            }

            $fecha = $this->parseFecha($rawFecha);
            if (!$fecha) {
                // Could not parse a non-empty date
                $summary['unparsedDates']++;
                continue;
            }

            // Extract fields
            $tipoMovimiento = $this->nullIfEmpty($this->getCell($rowVals, $map, 'tipomovimiento'));
            $tipoPago       = $this->nullIfEmpty($this->getCell($rowVals, $map, 'tipopago'));
            $concepto       = $this->nullIfEmpty($this->getCell($rowVals, $map, 'concepto'));
            $deposito       = $this->toDecimal($this->getCell($rowVals, $map, 'deposito'));
            $comision       = $this->toDecimal($this->getCell($rowVals, $map, 'comision'));
            $montoDisp      = $this->toDecimal($this->getCell($rowVals, $map, 'montodisponible'));

            // Debug sampling and ratio collection
            if ($debug && $sampled < 10 && $tipoMovimiento === 'Abono') {
                $rawDep = $this->getCell($rowVals, $map, 'deposito');
                $rawFee = $this->getCell($rowVals, $map, 'comision');
                $debugInfo['samples'][] = [
                    'row' => $rowIndex + 2,
                    'fecha' => $fecha->format('Y-m-d'),
                    'tipoMovimiento' => $tipoMovimiento,
                    'concepto' => $concepto,
                    'raw' => ['deposito' => (string)($rawDep ?? ''), 'comision' => (string)($rawFee ?? '')],
                    'parsed' => ['deposito' => $deposito, 'comision' => $comision],
                ];
                $sampled++;
            }
            if ($tipoMovimiento === 'Abono' && $deposito !== null && $comision !== null && (float)$deposito > 0) {
                $ratiosArr[] = (float)$comision / max((float)$deposito, 0.00001);
            }

            // Compute monto_contable for persistence (unified rule):
            // Always monto_contable = deposito - comision
            // - For Retiro rows, comision is typically null, so monto_contable stays equal to deposito (often negative).
            // - For Abono rows, this correctly nets commission out.
            $dep = $deposito !== null ? (float)$deposito : null;
            $fee = $comision !== null ? (float)$comision : 0.0;
            $montoContable = $dep !== null ? number_format($dep - $fee, 2, '.', '') : null;

            // Row hash for strict duplicates
            $rowHash = sha1(json_encode([
                'fecha' => $fecha->format('Y-m-d'),
                'tipoMovimiento' => $tipoMovimiento,
                'tipoPago' => $tipoPago,
                'concepto' => $concepto,
                'deposito' => $deposito,
                'comision' => $comision,
                'montoDisponible' => $montoDisp,
            ], JSON_UNESCAPED_UNICODE));

            if (isset($existingRowHashSet[$rowHash])) {
                $summary['duplicates']++;
                continue; // already imported exactly
            }

            // Group key for smart replace (ignores numeric changes)
            $groupKey = sha1(mb_strtolower(trim(
                ($fecha->format('Y-m-d') . '|' . ($tipoMovimiento ?? '') . '|' . ($tipoPago ?? '') . '|' . ($concepto ?? ''))
            ), 'UTF-8'));

            $active = $repo->findActiveByGroupKey($groupKey);
            $needsInsert = true;

            if ($active instanceof AccountantEntry) {
                // Compare field-by-field; if changed, supersede the active one
                $diffs = $this->diffEntries([
                    'deposito' => $deposito,
                    'comision' => $comision,
                    'montoDisponible' => $montoDisp,
                    'concepto' => $concepto,
                    'tipoMovimiento' => $tipoMovimiento,
                    'tipoPago' => $tipoPago,
                ], [
                    'deposito' => $active->getDeposito(),
                    'comision' => $active->getComision(),
                    'montoDisponible' => $active->getMontoDisponible(),
                    'concepto' => $active->getConcepto(),
                    'tipoMovimiento' => $active->getTipoMovimiento(),
                    'tipoPago' => $active->getTipoPago(),
                ]);

                if (!empty($diffs)) {
                    $changeSummary = 'Updated: ' . implode('; ', array_map(static function(string $k, array $c): string {
                        return sprintf('%s: "%s" → "%s"', $k, (string)$c['old'], (string)$c['new']);
                    }, array_keys($diffs), array_values($diffs)));

                    if (!$isDryRun) {
                        $repo->markAsSuperseded($active, $rowHash, $changeSummary);
                    }

                    $summary['superseded']++;
                    if (count($summary['changes']) < 20) {
                        $summary['changes'][] = [
                            'groupKey' => $groupKey,
                            'previousId' => $active->getId(),
                            'summary' => $changeSummary,
                        ];
                    }
                } else {
                    // No differences — treat as duplicate of the active state
                    $summary['duplicates']++;
                    $needsInsert = false;
                }
            }

            if ($needsInsert) {
                $entry = (new AccountantEntry())
                    ->setRowHash($rowHash)
                    ->setGroupKey($groupKey)
                    ->setFechaOn($fecha)
                    ->setFechaRaw(is_scalar($rawFecha) ? (string)$rawFecha : null)
                    ->setTipoMovimiento($tipoMovimiento)
                    ->setTipoPago($tipoPago)
                    ->setConcepto($concepto)
                    ->setDeposito($deposito)
                    ->setComision($comision)
                    ->setMontoDisponible($montoDisp)
                    ->setIsActive(true)
                    ->setSourceRowNumber($rowIndex + 2) // +2 accounting for header row being 1
                    ->setSourceFileName($file->getClientOriginalName())
                    ->setSourceSheetName($ext === 'csv' ? 'CSV' : 'Sheet1')
                    ->setMontoContable($montoContable);

                if (!$isDryRun && $import) {
                    $entry->setImport($import);
                } else {
                    // In dry run, we still need a non-null import property if DB requires it
                    if (property_exists(AccountantEntry::class, 'import') && $import instanceof AccountantImport) {
                        $entry->setImport($import);
                    }
                }

                if (!$isDryRun) {
                    $em->persist($entry);
                }
                $summary['inserted']++;
            }
        }

        if (!$isDryRun) {
            $em->flush();
        }

        if ($debug && !empty($ratiosArr)) {
            sort($ratiosArr);
            $n = count($ratiosArr);
            $median = $ratiosArr[(int) floor($n / 2)];
            $p90 = $ratiosArr[(int) floor($n * 0.9) < $n ? (int) floor($n * 0.9) : $n - 1];
            $debugInfo['ratios'] = [
                'median' => round($median, 4),
                'p90' => round($p90, 4),
                'count' => $n,
            ];
        }

        return new JsonResponse($debug ? array_merge($summary, ['debugInfo' => $debugInfo]) : $summary);
    }

    /** @return array{0: string[], 1: array<int,array<int,mixed>>} */
    private function parseSpreadsheet(string $path): array
    {
        // Use a reader that pre-calculates formulas, so cells like "=E2*0.1" return numeric values
        $reader = \PhpOffice\PhpSpreadsheet\IOFactory::createReaderForFile($path);
        // We want formatted strings for headers, but calculated numeric values for cells.
        $reader->setReadDataOnly(false);
        if (method_exists($reader, 'setPreCalculateFormulas')) {
            $reader->setPreCalculateFormulas(true);
        }
        $spreadsheet = $reader->load($path);
        $sheet = $spreadsheet->getActiveSheet();

        $highestColumnIdx = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::columnIndexFromString($sheet->getHighestColumn());
        $highestRow = $sheet->getHighestRow();

        // Headers (row 1) – usually plain text, but use getCalculatedValue for safety
        $headers = [];
        for ($c = 1; $c <= $highestColumnIdx; $c++) {
            $cell = $sheet->getCell(\PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($c) . '1');
            $val = $cell ? $cell->getCalculatedValue() : null;
            $headers[] = (string) ($val ?? '');
        }

        // Data rows – always prefer calculated values so we evaluate formulas
        $rows = [];
        for ($r = 2; $r <= $highestRow; $r++) {
            $row = [];
            for ($c = 1; $c <= $highestColumnIdx; $c++) {
                $addr = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($c) . $r;
                $cell = $sheet->getCell($addr);
                if ($cell === null) {
                    $row[] = null;
                    continue;
                }
                // getCalculatedValue will return numbers for formula cells; fallback to raw value if needed
                try {
                    $value = $cell->getCalculatedValue();
                } catch (\Throwable $e) {
                    $value = $cell->getValue();
                }
                $row[] = $value;
            }
            $rows[] = $row;
        }

        return [$headers, $rows];
    }

    /** @return array{0: string[], 1: array<int,array<int,mixed>>} */
    private function parseCsv(string $path): array
    {
        $f = new \SplFileObject($path, 'r');
        $f->setFlags(\SplFileObject::READ_CSV | \SplFileObject::SKIP_EMPTY);
        $headers = [];
        $rows = [];
        foreach ($f as $i => $data) {
            if ($data === [null] || $data === false) { continue; }
            if ($i === 0) {
                foreach ($data as $h) { $headers[] = (string)($h ?? ''); }
                continue;
            }
            $rows[] = $data;
        }
        return [$headers, $rows];
    }

    /** @param array<int,mixed> $row */
    private function getCell(array $row, array $map, string $key): mixed
    {
        if (!isset($map[$key])) { return null; }
        $idx = $map[$key];
        return $row[$idx] ?? null;
    }

    /** @param string[] $headers */
    private function buildHeaderMap(array $headers): array
    {
        // Known targets and flexible aliases. Prefer exact or word-level matches.
        // IMPORTANT: exclude IVA/percent variants from 'comision' to avoid grabbing the wrong column.
        $wanted = [
            'fecha' => ['fecha', 'fechaon', 'date', 'fecha de operacion', 'fechaoperacion'],
            'tipomovimiento' => ['tipo de movimiento', 'tipomovimiento', 'movimiento', 'tipo'],
            'tipopago' => ['tipo de pago', 'tipopago', 'pago', 'metododepago', 'metodo de pago'],
            'concepto' => ['concepto', 'detalle', 'descripcion', 'descripciondetalle'],
            // keep deposito strict to avoid matching "monto disponible"
            'deposito' => ['deposito', 'deposit', 'credito'],
            // Comisión variants — NO IVA or percent columns here
            'comision' => ['comision', 'comisión', 'comisiones', 'fee', 'comisionmxn', 'comisionbancaria'],
            // Monto Disponible variants
            'montodisponible' => ['montodisponible', 'monto disponible', 'saldodisponible', 'saldo disponible', 'saldo', 'balance', 'disponible'],
        ];

        // Normalize headers once
        $normHeaders = array_map(fn($h) => $this->normalizeHeader((string)$h), $headers);
        $map = [];
        $claimed = [];

        // Pass 1: exact normalized matches only
        foreach ($normHeaders as $i => $hn) {
            foreach ($wanted as $key => $aliases) {
                if (isset($map[$key])) { continue; }
                foreach ($aliases as $alias) {
                    $na = $this->normalizeHeader($alias);
                    if (!isset($claimed[$i]) && $hn === $na) {
                        $map[$key] = $i;
                        $claimed[$i] = true;
                        break 2;
                    }
                }
            }
        }

        // Pass 2: safe word-boundary match using the raw header text
        foreach ($headers as $i => $rawHeader) {
            foreach ($wanted as $key => $aliases) {
                if (isset($map[$key])) { continue; }
                foreach ($aliases as $alias) {
                    // word-boundary match, case-insensitive, on raw header (to respect human-readable words)
                    $pattern = '/\\b' . preg_quote($alias, '/') . '\\b/i';
                    if (!isset($claimed[$i]) && preg_match($pattern, (string)$rawHeader) === 1) {
                        $map[$key] = $i;
                        $claimed[$i] = true;
                        break 2;
                    }
                }
            }
        }

        return $map;
    }

    private function normalizeHeader(?string $header): string
    {
        $header = $header ?? '';
        $s = trim(mb_strtolower($header, 'UTF-8'));
        $s = str_replace(['\n', '\r'], ' ', $s);
        // strip accents
        $s = iconv('UTF-8', 'ASCII//TRANSLIT', $s) ?: $s;
        // collapse spaces and punctuation
        $s = preg_replace('/[^a-z0-9]+/i', '', $s);
        return $s ?? '';
    }

    private function nullIfEmpty(mixed $v): ?string
    {
        if ($v === null) return null;
        $s = trim((string)$v);
        return $s === '' ? null : $s;
    }

    private function toDecimal(mixed $v): ?string
    {
        if ($v === null || $v === '') return null;
        if (is_float($v) || is_int($v)) {
            return number_format((float)$v, 2, '.', '');
        }
        $s = (string)$v;
        $s = trim($s);
        if ($s === '') return null;

        // Detect negative via parentheses: (123.45) => -123.45
        $neg = false;
        if ($s[0] === '(' && substr($s, -1) === ')') { $neg = true; $s = substr($s, 1, -1); }

        // Remove common currency texts and symbols
        $s = str_ireplace(['$', '€', 'mxn', 'mn', 'm.n.', 'usd', 'us$', 'mx$', 'pesos', 'mx', 'mxn$'], '', $s);
        // Remove spaces incl. NBSP
        $s = str_replace(["\u{00A0}", '\u00A0', ' '], '', $s);

        // NEW: plain comma decimal without thousands, e.g., "512,65"
        if (preg_match('/^[-+]?\\d+,\\d{1,2}$/', $s)) {
            $s = str_replace(',', '.', $s);
        }
        // 1.234,56 -> 1234.56
        elseif (preg_match('/^[-+]?\\d{1,3}(\\.\\d{3})+,\\d{1,2}$/', $s)) {
            $s = str_replace('.', '', $s);
            $s = str_replace(',', '.', $s);
        }
        // 1,234.56 -> 1234.56
        elseif (preg_match('/^[-+]?\\d{1,3}(,\\d{3})+\\.\\d{1,2}$/', $s)) {
            $s = str_replace(',', '', $s);
        }
        else {
            // Remove any non-numeric except dot and minus
            $s = preg_replace('/[^0-9.\\-]/', '', $s) ?? '';
        }

        if ($s === '' || $s === '-' || $s === '.') return null;
        $val = is_numeric($s) ? (float)$s : null;
        if ($val === null) return null;
        if ($neg) $val = -$val;
        return number_format($val, 2, '.', '');
    }

    private function parseFecha(mixed $raw): ?DateTimeImmutable
    {
        if ($raw === null) return null;

        // Excel numeric serial
        if (is_numeric($raw)) {
            $base = new \DateTimeImmutable('1899-12-30'); // PhpSpreadsheet base
            $days = (int) $raw;
            return $base->modify("+{$days} days");
        }

        $s = trim((string)$raw);
        if ($s === '') return null;

        // Strip trailing time if present
        // e.g., "Febrero 04, 2025. 12:33" → "Febrero 04, 2025"
        $s = preg_replace('/\s+\d{1,2}:\d{2}(:\d{2})?$/', '', $s);

        // Replace Spanish month names with numbers
        $months = [
            'enero' => '01', 'febrero' => '02', 'marzo' => '03', 'abril' => '04', 'mayo' => '05', 'junio' => '06',
            'julio' => '07', 'agosto' => '08', 'septiembre' => '09', 'setiembre' => '09', 'octubre' => '10',
            'noviembre' => '11', 'diciembre' => '12',
        ];
        $sLow = mb_strtolower($s, 'UTF-8');
        foreach ($months as $name => $num) {
            if (str_contains($sLow, $name)) {
                // Formats like "Febrero 04, 2025" → 2025-02-04
                $sLow = preg_replace('/[^0-9]+/', ' ', $sLow);
                $parts = array_values(array_filter(explode(' ', $sLow), fn($p) => $p !== ''));
                if (count($parts) >= 3) {
                    // try to guess order: [day, month, year] or [month, day, year]
                    // After replace we lost month word, so fallback to parsing with DateTime
                }
                $sNorm = strtr(mb_strtolower($s, 'UTF-8'), array_combine(array_keys($months), array_values($months)));
                // e.g. "febrero 04, 2025" → "02 04, 2025"
                $sNorm = preg_replace('/\s+/', ' ', $sNorm);
                $sNorm = str_replace([',', '.'], ' ', $sNorm);
                $sNorm = preg_replace('/\s+/', ' ', $sNorm);
                $tokens = explode(' ', trim($sNorm));
                // Expect something like ["02","04","2025"] in some order
                $nums = array_values(array_filter($tokens, fn($t) => ctype_digit($t)));
                if (count($nums) >= 3) {
                    // Try M D Y first
                    [$a,$b,$y] = [$nums[0], $nums[1], $nums[2]];
                    $mdy = sprintf('%s-%s-%s', $y, str_pad($a,2,'0',STR_PAD_LEFT), str_pad($b,2,'0',STR_PAD_LEFT));
                    try { return new DateTimeImmutable($mdy); } catch (\Throwable $e) {}
                    // Then D M Y
                    $dmy = sprintf('%s-%s-%s', $y, str_pad($b,2,'0',STR_PAD_LEFT), str_pad($a,2,'0',STR_PAD_LEFT));
                    try { return new DateTimeImmutable($dmy); } catch (\Throwable $e) {}
                }
            }
        }

        // Try common numeric formats
        $candidates = [
            'd/m/Y', 'd-m-Y', 'd.m.Y',
            'm/d/Y', 'm-d-Y', 'm.d.Y',
            'Y-m-d', 'Y/m/d',
        ];
        foreach ($candidates as $fmt) {
            $dt = \DateTimeImmutable::createFromFormat($fmt, $s);
            if ($dt instanceof \DateTimeImmutable) {
                return DateTimeImmutable::createFromFormat('Y-m-d', $dt->format('Y-m-d'));
            }
        }

        // Last resort: let DateTime try
        try {
            $dt = new DateTimeImmutable($s);
            return DateTimeImmutable::createFromFormat('Y-m-d', $dt->format('Y-m-d'));
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * @param array<string,mixed> $new
     * @param array<string,mixed> $old
     * @return array<string,array{old:mixed,new:mixed}>
     */
    private function diffEntries(array $new, array $old): array
    {
        $diff = [];
        foreach ($new as $k => $vNew) {
            $vOld = $old[$k] ?? null;
            if ($vNew !== $vOld) {
                $diff[$k] = ['old' => $vOld, 'new' => $vNew];
            }
        }
        return $diff;
    }
    /**
     * Returns paginated AccountantEntry rows for the frontend DataTable.
     * Query params (all optional):
     * - page (int, default 1)
     * - perPage (int, default 25, max 200)
     * - sort (string: fechaOn|tipoMovimiento|tipoPago|concepto|deposito|comision|montoDisponible|isActive|supersededAt, default fechaOn)
     * - dir (string: asc|desc, default desc)
     * - search (string: matches concepto|tipoMovimiento|tipoPago, case-insensitive)
     * - dateFrom (Y-m-d)
     * - dateTo (Y-m-d)
     * - activeOnly (0|1)
     */
    #[Route('/api/accounting/import', name: 'api_accounting_import_list', methods: ['GET'])]
    public function list(Request $request, EntityManagerInterface $em): Response
    {
        $page = max(1, (int) $request->query->get('page', 1));
        $perPage = (int) $request->query->get('perPage', 25);
        $perPage = min(max(1, $perPage), 200);
        $search = trim((string) $request->query->get('search', ''));
        $dateFrom = $request->query->get('dateFrom');
        $dateTo = $request->query->get('dateTo');
        $sourceFileName = trim((string) $request->query->get('sourceFileName', ''));
        $activeOnly = (bool) ((int) $request->query->get('activeOnly', '1'));
        $scopeLatest = (bool) ((int) $request->query->get('scopeLatest', '0'));

        // If a specific source file is requested, default to scoping by its latest import
        if ($sourceFileName !== '' && $scopeLatest === false) {
            $scopeLatest = true;
        }

        // Build filters
        $conn = $em->getConnection();
        $wheres = [];
        $params = [];
        $wheresCommon = [];

        if ($search !== '') {
            $wheresCommon[] = '(LOWER(e.concepto) LIKE :q OR LOWER(e.tipo_pago) LIKE :q OR LOWER(e.tipo_movimiento) LIKE :q)';
            $params['q'] = '%' . mb_strtolower($search, 'UTF-8') . '%';
        }
        if (!empty($dateFrom)) {
            $wheresCommon[] = 'e.fecha_on >= :df';
            $params['df'] = $dateFrom; // Y-m-d
        }
        if (!empty($dateTo)) {
            $wheresCommon[] = 'e.fecha_on <= :dt';
            $params['dt'] = $dateTo; // Y-m-d
        }
        if ($sourceFileName !== '') {
            $wheresCommon[] = 'e.source_file_name = :sf';
            $params['sf'] = $sourceFileName;
            if ($scopeLatest) {
                // Only rows from the latest import that used this exact filename
                $wheresCommon[] = 'e.import_id = (SELECT MAX(id) FROM accountant_import WHERE filename = :sf)';
            }
        }
        // (Removed: global latest-import scoping when no explicit filters are provided)
        $whereSqlCommon = $wheresCommon ? ('WHERE ' . implode(' AND ', $wheresCommon)) : '';

        // For saldo (running balance), we want to accumulate over the full active history
        // (and any source-file scoping), but NOT restrict by dateFrom/dateTo or search.
        $saldoConds = [];
        if ($activeOnly) {
            $saldoConds[] = 'e.is_active = 1';
        }
        if ($sourceFileName !== '') {
            $saldoConds[] = 'e.source_file_name = :sf';
            if ($scopeLatest) {
                $saldoConds[] = 'e.import_id = (SELECT MAX(id) FROM accountant_import WHERE filename = :sf)';
            }
        }
        $saldoWhere = $saldoConds ? ('WHERE ' . implode(' AND ', $saldoConds)) : '';

        // Map sort to column names in DB (use alias "f." for outer query)
        $sortMap = [
            'fechaOn' => 'f.fecha_on',
            'tipoMovimiento' => 'f.tipo_movimiento',
            'tipoPago' => 'f.tipo_pago',
            'concepto' => 'f.concepto',
            'deposito' => 'f.deposito',
            'comision' => 'f.comision',
            'montoDisponible' => 'f.monto_disponible',
            'isActive' => 'f.is_active',
            'supersededAt' => 'f.superseded_at',
        ];
        $sortKey = (string) $request->query->get('sort', 'fechaOn');
        $orderBy = $sortMap[$sortKey] ?? 'f.fecha_on';
        $dir = strtolower((string) $request->query->get('dir', 'desc')) === 'asc' ? 'ASC' : 'DESC';

        // Total count
        $countConds = [];
        if ($activeOnly) { $countConds[] = 'e.is_active = 1'; }
        if ($whereSqlCommon !== '') { $countConds[] = substr($whereSqlCommon, 6); } // drop leading 'WHERE '
        $countSql = 'SELECT COUNT(*) AS cnt FROM accountant_entry e ' . ($countConds ? ('WHERE ' . implode(' AND ', $countConds)) : '');
        $total = (int) $conn->executeQuery($countSql, $params)->fetchOne();

        // Data with computed monto and saldo (saldo computed chronologically)
        $limit = (int) $perPage;
        $offset = (int) (($page - 1) * $perPage);

        $baseConds = [];
        if ($activeOnly) { $baseConds[] = 'e.is_active = 1'; }
        if ($whereSqlCommon !== '') { $baseConds[] = substr($whereSqlCommon, 6); }
        $baseWhere = $baseConds ? ('WHERE ' . implode(' AND ', $baseConds)) : '';

        // For the outer select (visible rows), we filter on alias `f` *after* saldo has been computed
        $selectConds = [];
        foreach ($baseConds as $cond) {
            $selectConds[] = str_replace('e.', 'f.', $cond);
        }
        $selectWhere = $selectConds ? ('WHERE ' . implode(' AND ', $selectConds)) : '';

        $dataSql = <<<SQL
WITH base AS (
    SELECT
        e.id,
        e.fecha_on,
        e.tipo_movimiento,
        e.tipo_pago,
        e.concepto,
        e.deposito,
        e.comision,
        e.is_active,
        e.superseded_at,
        e.source_file_name,
        e.source_row_number,
        e.monto_contable AS monto_contable,
        e.monto_contable AS monto,
        e.recon_checked_at,
        e.recon_checked_by,
        e.recon_payout_id
    FROM accountant_entry e
    $saldoWhere
),
with_saldo AS (
    SELECT
        b.*,
        SUM(b.monto) OVER (ORDER BY b.fecha_on ASC, b.id ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS saldo
    FROM base b
)
SELECT
    f.id,
    f.fecha_on,
    f.tipo_movimiento,
    f.tipo_pago,
    f.concepto,
    f.deposito,
    f.comision,
    f.is_active,
    f.superseded_at,
    f.source_file_name,
    f.source_row_number,
    f.monto_contable,
    f.monto,
    f.recon_checked_at,
    f.recon_checked_by,
    f.recon_payout_id,
    f.saldo
FROM with_saldo f
$selectWhere
ORDER BY $orderBy $dir, f.id $dir
LIMIT $limit OFFSET $offset
SQL;

        $stmt = $conn->executeQuery($dataSql, $params);
        $rows = $stmt->fetchAllAssociative();

        // Map to API fields
        $data = array_map(static function(array $r): array {
            return [
                'id' => (int)$r['id'],
                'fechaOn' => (new \DateTimeImmutable($r['fecha_on']))->format('Y-m-d'),
                'tipoMovimiento' => $r['tipo_movimiento'],
                'tipoPago' => $r['tipo_pago'],
                'concepto' => $r['concepto'],
                'deposito' => $r['deposito'] !== null ? number_format((float)$r['deposito'], 2, '.', '') : null,
                'comision' => $r['comision'] !== null ? number_format((float)$r['comision'], 2, '.', '') : null,
                'montoContable' => $r['monto_contable'] !== null ? number_format((float)$r['monto_contable'], 2, '.', '') : null,
                'monto' => $r['monto'] !== null ? number_format((float)$r['monto'], 2, '.', '') : null,
                'reconCheckedAt' => $r['recon_checked_at'] ? (new \DateTimeImmutable($r['recon_checked_at']))->format('Y-m-d H:i:s') : null,
                'reconCheckedBy' => $r['recon_checked_by'] !== null ? (int)$r['recon_checked_by'] : null,
                'reconPayoutId'  => $r['recon_payout_id'] !== null ? (int)$r['recon_payout_id'] : null,
                'saldo' => $r['saldo'] !== null ? number_format((float)$r['saldo'], 2, '.', '') : null,
                'isActive' => (bool)$r['is_active'],
                'supersededAt' => $r['superseded_at'] ? (new \DateTimeImmutable($r['superseded_at']))->format('Y-m-d H:i:s') : null,
                'sourceFileName' => $r['source_file_name'],
                'sourceRowNumber' => (int)$r['source_row_number'],
            ];
        }, $rows);

        return new JsonResponse([
            'page' => $page,
            'perPage' => $perPage,
            'total' => $total,
            'rows' => $data,
        ]);
    }
}