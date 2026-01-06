<?php

namespace App\Service;

use App\Entity\Payouts\AirbnbPayout;
use App\Entity\Payouts\AirbnbPayoutItem;
use Doctrine\ORM\EntityManagerInterface;

class AirbnbPayoutImportService
{
    private EntityManagerInterface $em;

    public function __construct(EntityManagerInterface $em)
    {
        $this->em = $em;
    }

    /**
     * Import Airbnb Payout Report (batches only).
     * Focuses exclusively on rows where Type = "Payout" and upserts by reference_code.
     *
     * Returns: [batches, created, updated]
     */
    public function importPayoutReport(string $csvPath): array
    {
        if (!is_readable($csvPath)) {
            throw new \RuntimeException("CSV not readable: " . $csvPath);
        }

        [$headers, $rows] = $this->readCsv($csvPath);
        $now = new \DateTimeImmutable('now');

        $repo = $this->em->getRepository(AirbnbPayout::class);

        $batches = 0; $created = 0; $updated = 0;
        $cacheByRef = [];
        $items = 0;
        $currentPayout = null;

        foreach ($rows as $row) {
            $typeRaw = (string)($this->get($row, $headers, ['Type']) ?? '');
            $type = strtolower(trim($typeRaw));

            // ----- Payout header row -----
            if ($type === 'payout' || ($type !== '' && str_contains($type, 'payout'))) {
                // Primary: use Airbnb's reference code when present
                $ref = $this->val($this->get($row, $headers, ['Reference code','Reference','Reference id','Reference ID']));

                // Fallback: some co-host / unit-specific reports do not include a reference code.
                // In that case, synthesize a stable reference using key fields from this row
                // so that repeated imports of the same CSV will upsert instead of duplicating.
                if (!$ref) {
                    $dateRaw    = $this->get($row, $headers, ['Date']);
                    $detailsRaw = $this->get($row, $headers, ['Details']);
                    $paidOutRaw = $this->get($row, $headers, ['Paid out']);

                    $fingerprint = trim(
                        (string)($dateRaw ?? '') . '|' .
                        (string)($detailsRaw ?? '') . '|' .
                        (string)($paidOutRaw ?? '')
                    );

                    if ($fingerprint !== '') {
                        $ref = 'COHOST-' . substr(sha1($fingerprint), 0, 16);
                    }
                }

                if (!$ref) { continue; }
                $key = strtolower($ref);

                // Upsert payout by reference_code
                if (isset($cacheByRef[$key])) {
                    /** @var AirbnbPayout $payout */
                    $payout = $cacheByRef[$key];
                } else {
                    $repo = $this->em->getRepository(AirbnbPayout::class);
                    /** @var AirbnbPayout|null $payout */
                    $payout = $repo->findOneBy(['referenceCode' => $ref]);
                    $isNew = false;
                    if (!$payout) {
                        $payout = new AirbnbPayout();
                        $payout->setReferenceCode($ref);
                        $payout->setImportedAt($now);
                        $this->em->persist($payout);
                        $isNew = true;
                    }
                    $cacheByRef[$key] = $payout;
                    if ($isNew) { $created++; }
                }

                // Map batch fields
                $payoutDate = $this->parseDate($this->get($row, $headers, ['Date']));
                $arrivingBy = $this->parseDate($this->get($row, $headers, ['Arriving by date','Arriving by']));
                $amount     = $this->parseMoney($this->get($row, $headers, ['Paid out']));
                $currency   = $this->val($this->get($row, $headers, ['Currency']));
                $details    = $this->val($this->get($row, $headers, ['Details']));

                $dirty = false;
                if ($payoutDate && $this->neq($payout->getPayoutDate(), $payoutDate)) { $payout->setPayoutDate($payoutDate); $dirty = true; }
                if ($arrivingBy && $this->neq($payout->getArrivingBy(), $arrivingBy)) { $payout->setArrivingBy($arrivingBy); $dirty = true; }
                if ($amount !== null && $payout->getAmount() !== $amount) { $payout->setAmount($amount); $dirty = true; }
                if ($currency && $payout->getCurrency() !== $currency) { $payout->setCurrency($currency); $dirty = true; }
                if ($details && $payout->getPayoutMethod() !== $details) { $payout->setPayoutMethod($details); $dirty = true; }
                if ($payout->getPayoutDestination() !== null) { $payout->setPayoutDestination(null); $dirty = true; }
                if (method_exists($payout, 'getNotes') && $payout->getNotes() !== null) { $payout->setNotes(null); $dirty = true; }
                if (method_exists($payout, 'getPayoutDetails') && $payout->getPayoutDetails() !== null) { $payout->setPayoutDetails(null); $dirty = true; }
                if ($dirty) { $updated++; }

                $batches++;
                $currentPayout = $payout; // set context for following item rows
                continue;
            }

            // ----- Item rows that belong to the last seen payout -----
            if (!$currentPayout) { continue; }

            // Accepted item types
            if (!in_array($type, ['reservation','host remitted tax','adjustment'], true)) {
                continue; // ignore other lines
            }

            // Extract columns
            $confirmation = $this->val($this->get($row, $headers, ['Confirmation code','Confirmation']));
            $listing      = $this->val($this->get($row, $headers, ['Listing']));
            $guest        = $this->val($this->get($row, $headers, ['Guest']));
            $startDate    = $this->parseDate($this->get($row, $headers, ['Start date']));
            $endDate      = $this->parseDate($this->get($row, $headers, ['End date']));
            $nightsStr    = $this->val($this->get($row, $headers, ['Nights']));
            $nights       = $nightsStr !== null && is_numeric(str_replace([',',' '], '', $nightsStr)) ? (int)str_replace([',',' '], '', $nightsStr) : null;
            $amount       = $this->parseMoney($this->get($row, $headers, ['Amount']));
            $gross        = $this->parseMoney($this->get($row, $headers, ['Gross earnings']));
            $cleaning     = $this->parseMoney($this->get($row, $headers, ['Cleaning fee']));
            $serviceFee   = $this->parseMoney($this->get($row, $headers, ['Service fee']));
            $currency     = $this->val($this->get($row, $headers, ['Currency']));

            // Upsert key: payout + confirmation + type + dates (fallback to listing when no confirmation)
            $itemRepo = $this->em->getRepository(AirbnbPayoutItem::class);
            $criteria = [
                'payout' => $currentPayout,
                'lineType' => $typeRaw ?: $type,
            ];
            if ($confirmation) {
                $criteria['confirmationCode'] = $confirmation;
            } else {
                $criteria['listing'] = $listing;
                $criteria['startDate'] = $startDate;
                $criteria['endDate'] = $endDate;
            }

            /** @var AirbnbPayoutItem|null $item */
            $item = $itemRepo->findOneBy($criteria);
            if (!$item) {
                $item = new AirbnbPayoutItem();
                $item->setPayout($currentPayout);
                $item->setImportedAt($now);
                $item->setLineType($typeRaw ?: $type);
                if ($confirmation) { $item->setConfirmationCode($confirmation); }
            }

            // Map fields
            if ($listing !== null) { $item->setListing($listing); }
            if ($guest !== null) { $item->setGuestName($guest); }
            if ($startDate) { $item->setStartDate($startDate); }
            if ($endDate) { $item->setEndDate($endDate); }
            if ($nights !== null) { $item->setNights($nights); }
            if ($amount !== null) { $item->setAmount($amount); }
            if ($gross !== null) { $item->setGrossEarnings($gross); }
            if ($cleaning !== null) { $item->setCleaningFee($cleaning); }
            if ($serviceFee !== null) { $item->setServiceFee($serviceFee); }
            // tax_amount intentionally left null per spec
            if ($currency !== null) { $item->setCurrency($currency); }

            $this->em->persist($item);
            $items++;
        }

        $this->em->flush();

        return [
            'batches' => $batches,
            'items'   => $items,
            'created' => $created,
            'updated' => $updated,
        ];
    }

    // ------------------------
    // Helpers
    // ------------------------

    /** @return array{0: array<int,string>, 1: array<int,array<int,string|null>>} */
    private function readCsv(string $path): array
    {
        $fh = fopen($path, 'rb');
        if ($fh === false) {
            throw new \RuntimeException('Unable to open CSV: ' . $path);
        }
        $headers = [];
        $rows = [];
        $lineNo = 0;
        while (($cols = fgetcsv($fh)) !== false) {
            $lineNo++;
            if ($lineNo === 1) {
                $headers = array_map(fn($h) => strtolower(trim((string)$h)), $cols);
                continue;
            }
            // Skip completely empty lines
            $isEmpty = true;
            foreach ($cols as $c) { if ($c !== null && trim($c) !== '') { $isEmpty = false; break; } }
            if ($isEmpty) { continue; }
            $rows[] = $cols;
        }
        fclose($fh);
        return [$headers, $rows];
    }

    /**
     * Get a column value by trying multiple header aliases (case-insensitive).
     * @param array<int,string|null> $row
     * @param array<int,string> $headers
     * @param array<int,string> $aliases
     */
    private function get(array $row, array $headers, array $aliases): ?string
    {
        foreach ($aliases as $alias) {
            $idx = $this->findHeader($headers, $alias);
            if ($idx !== null) {
                return isset($row[$idx]) ? (string)$row[$idx] : null;
            }
        }
        return null;
    }

    /** @param array<int,string> $headers */
    private function findHeader(array $headers, string $name): ?int
    {
        $name = strtolower(trim($name));
        foreach ($headers as $i => $h) {
            if ($h === $name) { return $i; }
        }
        return null;
    }

    private function val(?string $s): ?string
    {
        if ($s === null) { return null; }
        $t = trim($s);
        return $t === '' ? null : $t;
    }

    private function parseDate(?string $s): ?\DateTimeImmutable
    {
        $s = $this->val($s);
        if (!$s) { return null; }
        // Accept formats like MM/DD/YYYY or YYYY-MM-DD
        $s = str_replace(['\\',], '', $s);
        $try = [
            'Y-m-d', 'm/d/Y', 'd/m/Y', 'Y/m/d'
        ];
        foreach ($try as $fmt) {
            $dt = \DateTimeImmutable::createFromFormat($fmt, $s);
            if ($dt instanceof \DateTimeImmutable) {
                return $dt->setTime(0,0);
            }
        }
        // final attempt letting strtotime guess
        $ts = strtotime($s);
        return $ts ? (new \DateTimeImmutable('@'.$ts))->setTimezone(new \DateTimeZone(date_default_timezone_get()))->setTime(0,0) : null;
    }

    private function parseMoney(?string $s): ?string
    {
        $s = $this->val($s);
        if ($s === null) { return null; }
        // Strip currency symbols and thousand separators
        $v = str_replace([',', ' ', '$', 'MXN', 'USD'], '', $s);
        // Handle European decimals like 1.234,56 -> 1234.56
        if (preg_match('/^[-\d\.]*,\d{2}$/', $v)) {
            $v = str_replace('.', '', $v);
            $v = str_replace(',', '.', $v);
        }
        if ($v === '' || !is_numeric($v)) { return null; }
        // Store as string to avoid float precision issues on DECIMAL columns
        return number_format((float)$v, 2, '.', '');
    }

    private function neq($a, $b): bool
    {
        if ($a instanceof \DateTimeInterface && $b instanceof \DateTimeInterface) {
            return $a->format('Y-m-d') !== $b->format('Y-m-d');
        }
        return $a !== $b;
    }
}