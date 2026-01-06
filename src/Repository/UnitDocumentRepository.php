<?php

namespace App\Repository;

use App\Entity\UnitDocument;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<UnitDocument>
 *
 * @method UnitDocument|null find($id, $lockMode = null, $lockVersion = null)
 * @method UnitDocument|null findOneBy(array $criteria, array $orderBy = null)
 * @method UnitDocument[]    findAll()
 * @method UnitDocument[]    findBy(array $criteria, array $orderBy = null, $limit = null, $offset = null)
 */
class UnitDocumentRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, UnitDocument::class);
    }

    // /**
    //  * @return UnitDocument[] Returns an array of UnitDocument objects
    //  */
    // public function findByExampleField($value)
    // {
    //     return $this->createQueryBuilder('u')
    //         ->andWhere('u.exampleField = :val')
    //         ->setParameter('val', $value)
    //         ->orderBy('u.id', 'ASC')
    //         ->setMaxResults(10)
    //         ->getQuery()
    //         ->getResult()
    //     ;
    // }
    //
    // public function findOneBySomeField($value): ?UnitDocument
    // {
    //     return $this->createQueryBuilder('u')
    //         ->andWhere('u.someField = :val')
    //         ->setParameter('val', $value)
    //         ->getQuery()
    //         ->getOneOrNullResult()
    //     ;
    // }
}