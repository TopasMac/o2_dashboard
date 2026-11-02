<?php

namespace App\Service;

use Doctrine\DBAL\Connection;

final class MobileUnitAccessService
{
    public const VISIBLE_STATUSES = ['active', 'onboarding'];

    public function __construct(private Connection $conn)
    {
    }

    /**
     * Operational access details for Active and Onboarding units.
     * A null city returns both operational cities.
     *
     * @return list<array<string, mixed>>
     */
    public function list(?string $city): array
    {
        $sql = <<<'SQL'
SELECT u.id AS id,
       u.unit_name AS unit_name,
       u.city AS city,
       u.status AS status,
       u.unit_number AS unit_number,
       u.unit_floor AS unit_floor,
       u.access_type AS access_type,
       u.access_code AS access_code,
       u.wifi_name AS wifi_name,
       u.wifi_password AS wifi_password,
       c.condo_name AS condo_name,
       c.door_code AS condo_door_code,
       c.google_maps AS condo_google_maps
FROM unit u
LEFT JOIN condo c ON c.id = u.condo_id
WHERE LOWER(u.status) IN (:statuses)
  AND u.date_ended IS NULL
  AND u.city IN (:cities)
SQL;
        $cities = $city !== null ? [$city] : ['Playa del Carmen', 'Tulum'];
        if ($city !== null && !in_array($city, ['Playa del Carmen', 'Tulum'], true)) {
            return [];
        }
        $sql .= "\nORDER BY u.unit_name ASC";

        return $this->conn->executeQuery(
            $sql,
            ['statuses' => self::VISIBLE_STATUSES, 'cities' => $cities],
            ['statuses' => Connection::PARAM_STR_ARRAY, 'cities' => Connection::PARAM_STR_ARRAY],
        )->fetchAllAssociative();
    }
}
