<?php

namespace App\EventListener;

use App\Entity\O2Transactions;
use Doctrine\ORM\Event\PrePersistEventArgs;
use Doctrine\ORM\Event\PreUpdateEventArgs;
use Symfony\Bundle\SecurityBundle\Security;

/**
 * Ensures audit fields are set consistently for O2Transactions.
 *
 * Rules:
 *  - New transaction (prePersist):
 *      • created_by = current user
 *      • updated_by = null
 *      • updated_at = null
 *      • Business date is set by the controller and must not be modified here.
 *  - Edit transaction (preUpdate):
 *      • updated_at = today (DateImmutable)
 *      • updated_by = current user
 *      • created_by remains unchanged
 */
class O2TransactionsAuditListener
{
    private Security $security;

    public function __construct(Security $security)
    {
        $this->security = $security;
    }

    private function currentUsername(): string
    {
        $user = $this->security->getUser();
        if (!$user) {
            return 'system';
        }
        // Prefer human-friendly name first
        if (method_exists($user, 'getName') && $user->getName()) {
            return (string) $user->getName();
        }
        if (method_exists($user, 'getFullName') && $user->getFullName()) {
            return (string) $user->getFullName();
        }
        // Fallbacks: username/identifier/email
        if (method_exists($user, 'getUserIdentifier')) {
            return (string) $user->getUserIdentifier();
        }
        if (method_exists($user, 'getUsername')) {
            return (string) $user->getUsername();
        }
        if (method_exists($user, 'getEmail')) {
            return (string) $user->getEmail();
        }
        return (string) $user; // may call __toString
    }

    /**
     * Set defaults on creation.
     */
    public function prePersist(PrePersistEventArgs $args): void
    {
        $entity = $args->getObject();
        if (!$entity instanceof O2Transactions) {
            return;
        }

        $today = new \DateTimeImmutable('today'); // DATE_IMMUTABLE in DB

        // created_by = current user
        $entity->setCreatedBy($this->currentUsername());

        // updated_by/updated_at must be NULL on create
        $entity->setUpdatedBy(null);
        $entity->setUpdatedAt(null);
    }

    /**
     * Stamp audit fields on update.
     */
    public function preUpdate(PreUpdateEventArgs $args): void
    {
        $entity = $args->getObject();
        if (!$entity instanceof O2Transactions) {
            return;
        }

        $today = new \DateTimeImmutable('today'); // DATE_IMMUTABLE in DB

        // Only set update fields; do NOT touch created_by/created_at
        $entity->setUpdatedAt($today);
        $entity->setUpdatedBy($this->currentUsername());

        // Recompute changeset so Doctrine picks up our programmatic changes
        $em = $args->getObjectManager();
        $uow = $em->getUnitOfWork();
        $meta = $em->getClassMetadata(O2Transactions::class);
        $uow->recomputeSingleEntityChangeSet($meta, $entity);
    }
}