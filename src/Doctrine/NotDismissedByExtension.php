<?php

namespace App\Doctrine;

use ApiPlatform\Doctrine\Orm\Extension\QueryCollectionExtensionInterface;
use ApiPlatform\Doctrine\Orm\Util\QueryNameGeneratorInterface;
use ApiPlatform\Metadata\Operation;
use Doctrine\ORM\QueryBuilder;
use Symfony\Component\HttpFoundation\RequestStack;
use App\Entity\AirbnbEmailNotifications;
use App\Entity\NotificationDismissal;

final class NotDismissedByExtension implements QueryCollectionExtensionInterface
{
    public function __construct(private RequestStack $requestStack, private \Psr\Log\LoggerInterface $logger) {}

    public function applyToCollection(
        QueryBuilder $qb,
        QueryNameGeneratorInterface $qng,
        string $resourceClass,
        ?Operation $operation = null,
        array $context = []
    ): void {
        // Only apply to the AirbnbEmailNotifications collection
        if ($resourceClass !== AirbnbEmailNotifications::class) {
            return;
        }

        $request = $this->requestStack->getCurrentRequest();
        if (!$request) {
            return;
        }

        $email = $request->query->get('notDismissedBy');
        if (!$email) {
            return;
        }

        $rootAlias = $qb->getRootAliases()[0];

        try {
            // Exclude notifications that have a dismissal for this user using a scalar COUNT subquery (= 0).
            $sub = $qb->getEntityManager()->createQueryBuilder()
                ->select('COUNT(nd1.id)')
                ->from(NotificationDismissal::class, 'nd1')
                ->where(sprintf('IDENTITY(nd1.notification) = %s.id', $rootAlias))
                ->andWhere('nd1.userEmail = :ndbEmail')
                ->getDQL();

            $qb->andWhere(sprintf('(%s) = 0', $sub))
               ->setParameter('ndbEmail', $email);
        } catch (\Throwable $e) {
            // Log and fail open (do not break the endpoint)
            $this->logger->error('[NotDismissedByExtension] filter failed', [
                'error' => $e->getMessage(),
                'class' => NotificationDismissal::class,
                'resource' => $resourceClass,
            ]);
            return;
        }
    }
}