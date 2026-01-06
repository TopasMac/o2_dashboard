<?php

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\ClientUnitNote;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\SecurityBundle\Security;

/**
 * Handles POST /api/client_unit_notes via ApiPlatform v3 Processor.
 * - Sets author = current user
 * - Nulls yearMonth when entryType = LOG
 * - Persists the entity
 */
class ClientUnitNoteCreateProcessor implements ProcessorInterface
{
    public function __construct(
        private EntityManagerInterface $em,
        private Security $security,
    ) {}

    /**
     * @param ClientUnitNote $data
     */
    public function process($data, Operation $operation, array $uriVariables = [], array $context = [])
    {
        if (!$data instanceof ClientUnitNote) {
            return $data;
        }

        // Normalize entry type and enforce that LOG has no yearMonth
        $type = strtoupper($data->getEntryType() ?? '');
        if ($type === 'LOG') {
            $data->setYearMonth(null);
        } else {
            // REPORT: leave as provided; entity-level Assert handles YYYY-MM requirement
        }

        // Set author from current user if available
        $user = $this->security->getUser();
        if ($user !== null && method_exists($data, 'setAuthor')) {
            $data->setAuthor($user);
        }

        // Persist
        $this->em->persist($data);
        $this->em->flush();

        return $data;
    }
}