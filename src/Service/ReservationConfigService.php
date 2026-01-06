<?php

namespace App\Service;

use App\Repository\BookingConfigRepository;
use App\Entity\BookingConfig;

class ReservationConfigService
{
    private BookingConfigRepository $configRepo;

    public function __construct(BookingConfigRepository $configRepo)
    {
        $this->configRepo = $configRepo;
    }

    public function getConfigForType(string $type): ?BookingConfig
    {
        // Map reservation types to config codes
        $configMap = [
            'o2' => 'o2_0825',
            'client' => 'client_0825',
            'private_cash' => 'privcash_0825',
            'private_card' => 'privcard_0825',
        ];

        $configCode = $configMap[$type] ?? null;

        if (!$configCode) {
            throw new \InvalidArgumentException("Unknown reservation type: $type");
        }

        return $this->configRepo->findOneBy(['configCode' => $configCode]);
    }
}
