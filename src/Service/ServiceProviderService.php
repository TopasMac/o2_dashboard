<?php

namespace App\Service;

use App\Entity\ServiceProvider;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;

class ServiceProviderService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly Connection $db,
    ) {
    }

    /**
     * Create and persist a ServiceProvider.
     *
     * This method is concurrency-safe for providerId generation.
     *
     * Expected keys in $data (all optional except name/occupation/area):
     * - name (string)
     * - occupation (string)
     * - area (Playa|Tulum|Both)
     * - phone, whatsapp, email (string|null)
     * - bankName, accountHolder, clabe, accountNumber (string|null)
     * - notes (string|null)
     * - isActive (bool|null)
     */
    public function create(array $data): ServiceProvider
    {
        $provider = new ServiceProvider();
        $this->apply($provider, $data + ['name' => null, 'occupation' => null]);

        // Generate providerId in a transaction to avoid duplicates
        $this->db->beginTransaction();
        try {
            $providerId = $this->generateProviderIdLocked();
            $provider->setProviderId($providerId);

            $this->em->persist($provider);
            $this->em->flush();

            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }

        return $provider;
    }

    public function update(ServiceProvider $provider, array $data): ServiceProvider
    {
        $this->apply($provider, $data);
        $this->em->flush();

        return $provider;
    }

    private function apply(ServiceProvider $provider, array $data): void
    {
        if (array_key_exists('bankType', $data)) {
            $data = $this->applyBankType($data);
        }

        $name = $this->requiredText($data, 'name');
        $occupation = $this->requiredText($data, 'occupation');

        if ($name !== null) {
            $provider->setName($name);
        }
        if ($occupation !== null) {
            $provider->setOccupation($occupation);
        }
        if (isset($data['area'])) {
            $provider->setArea((string)$data['area']);
        }

        if (array_key_exists('phone', $data)) {
            $provider->setPhone($this->nullIfEmpty($data['phone']));
        }
        if (array_key_exists('whatsapp', $data)) {
            $provider->setWhatsapp($this->nullIfEmpty($data['whatsapp']));
        }
        if (array_key_exists('email', $data)) {
            $provider->setEmail($this->nullIfEmpty($data['email']));
        }

        if (array_key_exists('bankName', $data)) {
            $provider->setBankName($this->nullIfEmpty($data['bankName']));
        }
        if (array_key_exists('accountHolder', $data)) {
            $provider->setAccountHolder($this->nullIfEmpty($data['accountHolder']));
        }
        if (array_key_exists('clabe', $data)) {
            $provider->setClabe($this->nullIfEmpty($data['clabe']));
        }
        if (array_key_exists('accountNumber', $data)) {
            $provider->setAccountNumber($this->nullIfEmpty($data['accountNumber']));
        }

        if (array_key_exists('notes', $data)) {
            $provider->setNotes($this->nullIfEmpty($data['notes']));
        }

        if (array_key_exists('isActive', $data) && $data['isActive'] !== null) {
            $provider->setIsActive((bool)$data['isActive']);
        }
    }

    private function applyBankType(array $data): array
    {
        $type = $data['bankType'];
        if (!in_array($type, ['Card', 'CLABE'], true)) {
            throw new \InvalidArgumentException('Bank type must be Card or CLABE.');
        }

        $bank = $this->nullIfEmpty($data['bankName'] ?? null);
        $holder = $this->nullIfEmpty($data['accountHolder'] ?? null);
        $number = $this->nullIfEmpty($data['bankNumber'] ?? null);
        $maxLength = $type === 'Card' ? 30 : 25;
        if ($bank === null || $holder === null || $number === null || !ctype_digit($number)
            || strlen($number) > $maxLength || mb_strlen($bank) > 80 || mb_strlen($holder) > 120) {
            throw new \InvalidArgumentException('Enter a valid account holder, bank, and number.');
        }

        $data['accountNumber'] = $type === 'Card' ? $number : null;
        $data['clabe'] = $type === 'CLABE' ? $number : null;

        return $data;
    }

    /**
     * Generates a new provider id like SP000001.
     *
     * Uses SELECT ... FOR UPDATE to be safe under concurrent requests.
     */
    private function generateProviderIdLocked(): string
    {
        // Lock the latest row (if any) so two writers don't generate the same next id.
        $row = $this->db->fetchAssociative(
            "SELECT provider_id FROM service_providers ORDER BY id DESC LIMIT 1 FOR UPDATE"
        );

        $last = $row['provider_id'] ?? null;

        $nextNumber = 1;
        if (is_string($last) && preg_match('/^SP(\d+)$/', $last, $m)) {
            $nextNumber = ((int)$m[1]) + 1;
        }

        return sprintf('SP%06d', $nextNumber);
    }

    private function requiredText(array $data, string $key): ?string
    {
        if (!array_key_exists($key, $data)) {
            return null;
        }

        $value = $this->nullIfEmpty($data[$key]);
        if ($value === null) {
            throw new \InvalidArgumentException("ServiceProvider.$key is required");
        }

        return $value;
    }

    private function nullIfEmpty(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        if (!is_string($value)) {
            throw new \InvalidArgumentException('Provider text fields must be strings');
        }

        $s = trim($value);

        return $s === '' ? null : $s;
    }
}
