<?php

namespace App\Service;

use App\Entity\HKCleanings;
use Doctrine\ORM\EntityManagerInterface;

/** Cancels work and removes its accounting entry in one transaction. */
class HKCleaningCancellation
{
    public function __construct(private readonly EntityManagerInterface $em) {}

    public function setCancelled(HKCleanings $cleaning): void
    {
        $db = $this->em->getConnection();
        $previousStatus = $cleaning->getStatus();
        $db->beginTransaction();
        try {
            // Delete every linked entry, including any historical duplicates.
            $db->executeStatement('DELETE FROM hktransactions WHERE hk_cleaning_id = :id', ['id' => $cleaning->getId()]);
            $cleaning->setStatus(HKCleanings::STATUS_CANCELLED);
            $this->em->persist($cleaning);
            $this->em->flush();
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            $cleaning->setStatus($previousStatus);
            throw $e;
        }
    }

    /** Retain reopened work in reconciliation and keep its fee waived until completion. */
    public function retainSnapshot(HKCleanings $hk): void
    {
        if ($hk->getUnit() !== null && !$this->em->getConnection()->fetchOne('SELECT 1 FROM hk_cleanings_reconcile WHERE hk_cleaning_id = ?', [$hk->getId()])) {
            $date = \DateTimeImmutable::createFromInterface($hk->getCheckoutDate());
            $snapshot = (new \App\Entity\HKCleaningsReconcile())
                ->setHkCleaning($hk)->setUnit($hk->getUnit())->setCity($hk->getCity())
                ->setReportMonth($date->format('Y-m'))->setServiceDate($date)
                ->setCleaningCost($hk->getCleaningCost() ?? '0.00')
                ->setLaundryCost($hk->getLaundryCost() ?? '0.00')
                ->setRealCleaningCost(number_format((float)$hk->getCleaningCost() + (float)$hk->getLaundryCost(), 2, '.', ''));
            $this->em->persist($snapshot);
        }
    }
}
