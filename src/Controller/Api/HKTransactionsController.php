<?php

namespace App\Controller\Api;

use App\Entity\HKTransactions;
use App\Entity\Employee;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Serializer\SerializerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;
use App\Entity\UnitDocument;
use App\Entity\UnitDocumentAttachment;
use App\Service\Document\DocumentUploadService;
use App\Service\Document\AttachOptions;

#[Route('/api/hk-transactions', name: 'api_hk_transactions_')]
class HKTransactionsController extends AbstractController
{
    private const ALLOWED_CITIES = ['Playa del Carmen', 'Tulum', 'General'];

    #[Route('/form-options', name: 'form_options', methods: ['GET'])]
    public function formOptions(EntityManagerInterface $em): JsonResponse
    {
        // Units (minimal fields for selects)
        $units = $em->getRepository('App\\Entity\\Unit')
            ->createQueryBuilder('u')
            ->select('u.id AS id', 'u.unitName AS unitName', 'u.city AS city')
            ->orderBy('u.unitName', 'ASC')
            ->getQuery()
            ->getArrayResult();

        // Categories where allow_hk = 1
        $categories = $em->getRepository('App\\Entity\\TransactionCategory')
            ->createQueryBuilder('c')
            ->select('c.id AS id', 'c.name AS name', 'c.type AS type', 'c.allowHk AS allowHk')
            ->where('c.allowHk = :yes')
            ->setParameter('yes', true)
            ->orderBy('c.name', 'ASC')
            ->getQuery()
            ->getArrayResult();

        return $this->json([
            'units' => $units,
            'categories' => $categories,
            'cities' => self::ALLOWED_CITIES,
        ]);
    }

    #[Route('', name: 'list', methods: ['GET'])]
    public function list(Request $request, EntityManagerInterface $em, SerializerInterface $serializer): JsonResponse
    {
        $repo = $em->getRepository(HKTransactions::class);

        $attachmentRepo = $em->getRepository(UnitDocumentAttachment::class);

        // Read optional filters
        $unitIdParam = $request->query->get('unitId');
        $yearMonth = $request->query->get('yearMonth');
        $costCentre = $request->query->get('costCentre'); // no default; null means "all"

        $hasAnyFilter = $request->query->has('unitId') || $request->query->has('yearMonth') || $request->query->has('costCentre');

        $unitId = null;
        if ($unitIdParam !== null && $unitIdParam !== '') {
            $unitId = (int) $unitIdParam;
        }

        $from = null;
        $to = null;
        if ($yearMonth) {
            try {
                $from = new \DateTimeImmutable($yearMonth . '-01');
                $to = $from->modify('last day of this month');
            } catch (\Exception $e) {
                $from = null;
                $to = null;
            }
        }

        if ($hasAnyFilter) {
            $transactions = $repo->findByFiltersClient($unitId, $from, $to, $costCentre);
        } else {
            $transactions = $repo->findAll();
        }

        // Normalize with existing groups, then append unitStatus derived from related Unit
        $normalized = $serializer->normalize($transactions, null, ['groups' => ['hktransactions:read']]);
        if (is_array($normalized)) {
            foreach ($normalized as $i => &$row) {
                try {
                    $unit = $transactions[$i]->getUnit();
                    $row['unitStatus'] = ($unit && method_exists($unit, 'getStatus')) ? $unit->getStatus() : null;
                } catch (\Throwable $e) {
                    // keep row as-is if anything goes wrong
                }
                // Add attachments URLs from UnitDocumentAttachment (targetType = hk_transaction)
                $files = [];
                try {
                    $attachments = $attachmentRepo->findBy([
                        'targetType' => 'hk_transaction',
                        'targetId'   => $transactions[$i]->getId(),
                    ]);

                    foreach ($attachments as $att) {
                        if (method_exists($att, 'getDocument') && $att->getDocument()) {
                            $doc = $att->getDocument();

                            $url = null;
                            if (method_exists($doc, 'getUrl') && $doc->getUrl()) {
                                $url = $doc->getUrl();
                            } elseif (method_exists($doc, 'getS3Url') && $doc->getS3Url()) {
                                $url = $doc->getS3Url();
                            } elseif (method_exists($doc, 'getDocumentUrl') && $doc->getDocumentUrl()) {
                                $url = $doc->getDocumentUrl();
                            } elseif (method_exists($doc, 'getFilepath') && $doc->getFilepath()) {
                                $url = $doc->getFilepath();
                            }

                            $files[] = [
                                'id'       => method_exists($doc, 'getId') ? $doc->getId() : null,
                                'url'      => $url,
                                'category' => method_exists($att, 'getCategory') ? $att->getCategory() : null,
                            ];
                        }
                    }
                } catch (\Throwable $e) {
                    // If anything goes wrong when resolving attachments, leave them empty
                }

                $row['attachments'] = $files;
            }
            unset($row);
        }
        return new JsonResponse($normalized, 200);
    }
    #[Route('', name: 'create', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $em, DocumentUploadService $documentUploadService): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        $transaction = new HKTransactions();
        $transaction->generateTransactionCode();

        $this->mapDataToTransaction($transaction, $data, $em);

        // Validate
        $unit = $transaction->getUnit();
        if ($unit === null) {
            return $this->json([
                'error' => 'Unit must be set.'
            ], 400);
        }

        $isHousekeepersUnit = $unit && method_exists($unit, 'getUnitName') && $unit->getUnitName() === 'Housekeepers';

        // For the Housekeepers unit, city is required and must be one of the allowed values.
        // For normal units, city mirrors the unit city.
        if ($isHousekeepersUnit) {
            $city = $transaction->getCity();
            if ($city === null || !in_array($city, self::ALLOWED_CITIES, true)) {
                return $this->json([
                    'error' => 'City is required for Housekeepers unit and must be one of: Playa del Carmen, Tulum, General.'
                ], 400);
            }
        } else {
            if (method_exists($unit, 'getCity')) {
                $transaction->setCity($unit->getCity());
            }
        }

        $em->persist($transaction);
        $em->flush();

        // Optional: reuse existing documents from another source (e.g. Employee Cash Ledger)
        // Expected payload shape:
        //  - sourceType: 'employeeCash'
        //  - sourceId: <cashLedgerId> (not strictly required for this reuse, but reserved)
        //  - sourceAttachments: [
        //        { "documentId": 123 },
        //        { "documentId": 456 }
        //    ]
        if (
            isset($data['sourceType'], $data['sourceId']) &&
            $data['sourceType'] === 'employeeCash' &&
            $data['sourceId'] !== null &&
            $data['sourceId'] !== '' &&
            !empty($data['sourceAttachments']) &&
            is_array($data['sourceAttachments'])
        ) {
            $sourceId = (int) $data['sourceId'];
            $attachments = $data['sourceAttachments'];
            foreach ($attachments as $att) {
                // Support both { documentId: X } and raw ids in the array
                $documentId = null;
                if (is_array($att) && isset($att['documentId'])) {
                    $documentId = (int) $att['documentId'];
                } elseif (is_scalar($att)) {
                    $documentId = (int) $att;
                }

                if (!$documentId) {
                    continue;
                }

                /** @var UnitDocument|null $doc */
                $doc = $em->getRepository(UnitDocument::class)->find($documentId);
                if (!$doc) {
                    continue;
                }

                // Attach the existing document to this HK transaction as a separate attachment.
                // Category is stored as "HK Transaction" to distinguish in the UI.
                $opts = new AttachOptions(
                    targetType: 'hk_transaction',
                    targetId: $transaction->getId(),
                    category: 'HK Transaction',
                    mode: 'allow-many',
                    scope: 'per-parent'
                );

                // This method should create a UnitDocumentAttachment pointing to the same UnitDocument.
                // If your DocumentUploadService returns the attachment entity, we don't need to store it here.
                $documentUploadService->attachExistingDocument($doc, $opts);
            }

            // Persist any new attachments
            $em->flush();
        }

        return $this->json($transaction, 201, [], ['groups' => ['hktransactions:read']]);
    }

    #[Route('/{id}', name: 'get', methods: ['GET'])]
    public function getTransaction(HKTransactions $transaction): JsonResponse
    {
        return $this->json($transaction, 200, [], ['groups' => ['hktransactions:read']]);
    }

    #[Route('/{id}', name: 'update', methods: ['PUT'])]
    public function update(Request $request, HKTransactions $transaction, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        $this->mapDataToTransaction($transaction, $data, $em);

        // Validate
        $unit = $transaction->getUnit();
        if ($unit === null) {
            return $this->json([
                'error' => 'Unit must be set.'
            ], 400);
        }

        $isHousekeepersUnit = $unit && method_exists($unit, 'getUnitName') && $unit->getUnitName() === 'Housekeepers';

        // For the Housekeepers unit, city is required and must be one of the allowed values.
        // For normal units, city mirrors the unit city.
        if ($isHousekeepersUnit) {
            $city = $transaction->getCity();
            if ($city === null || !in_array($city, self::ALLOWED_CITIES, true)) {
                return $this->json([
                    'error' => 'City is required for Housekeepers unit and must be one of: Playa del Carmen, Tulum, General.'
                ], 400);
            }
        } else {
            if (method_exists($unit, 'getCity')) {
                $transaction->setCity($unit->getCity());
            }
        }

        $em->flush();

        return $this->json($transaction, 200, [], ['groups' => ['hktransactions:read']]);
    }

    private function mapDataToTransaction(HKTransactions $transaction, array $data, EntityManagerInterface $em): void
    {
        if (isset($data['date'])) {
            // Normalize to immutable date-only (Y-m-d)
            $base = \DateTimeImmutable::createFromFormat('Y-m-d', (string) $data['date'])
                ?: new \DateTimeImmutable((string) $data['date']);
            $transaction->setDate(\DateTimeImmutable::createFromFormat('Y-m-d', $base->format('Y-m-d')));
        }
        if (isset($data['categoryId'])) {
            $category = $em->getRepository('App\\Entity\\TransactionCategory')->find($data['categoryId']);
            if ($category) {
                $transaction->setCategory($category);
            }
        }
        if (isset($data['costCentre'])) {
            $transaction->setCostCentre($data['costCentre']);
        }
        if (array_key_exists('description', $data)) {
            $transaction->setDescription($data['description']);
        }
        if (array_key_exists('notes', $data)) {
            $transaction->setNotes($data['notes']);
        }
        if (isset($data['paid'])) {
            $transaction->setPaid($data['paid'] !== '' ? $data['paid'] : 0);
        }
        if (isset($data['charged'])) {
            $transaction->setCharged($data['charged'] !== '' ? $data['charged'] : 0);
        }

        // If Category = Nomina, allow passing employeeId (preferred) or numeric description (legacy) and resolve to employee shortName
        $isNomina = $transaction->getCategory() && strtolower((string) $transaction->getCategory()->getName()) === 'nomina';
        if ($isNomina) {
            $empId = null;
            if (isset($data['employeeId']) && $data['employeeId'] !== '') {
                $empId = (int) $data['employeeId'];
            } elseif (isset($data['description']) && is_numeric($data['description'])) {
                // Backward-compatible: description as a numeric id
                $empId = (int) $data['description'];
            }
            if ($empId) {
                $emp = $em->getRepository(Employee::class)->find($empId);
                if ($emp) {
                    // Write a human-readable label to description
                    if (method_exists($emp, 'getShortName') && $emp->getShortName()) {
                        $transaction->setDescription($emp->getShortName());
                    } else {
                        $name = method_exists($emp, 'getName') ? $emp->getName() : null;
                        $code = method_exists($emp, 'getEmployeeCode') ? $emp->getEmployeeCode() : null;
                        $transaction->setDescription($name ?? $code ?? (string) $empId);
                    }
                    // Optionally store the code into reference if available
                    if (method_exists($transaction, 'setReference') && method_exists($emp, 'getEmployeeCode')) {
                        $transaction->setReference($emp->getEmployeeCode());
                    }
                }
            }
        }

        // Allocation Target (who we charge): Client | Owners2 | Guest | Housekeepers
        // Backward compatibility:
        //  - 'Unit' => 'Client'
        //  - 'Housekeepers_Playa'/'Housekeepers_Tulum'/'Housekeepers_General'/'Housekeepers_Both' => 'Housekeepers'
        if (array_key_exists('allocationTarget', $data)) {
            $target = $data['allocationTarget'];
            if ($target === 'Housekeepers_Both') {
                $target = 'Housekeepers';
            }
            if (in_array($target, ['Housekeepers_Playa', 'Housekeepers_Tulum', 'Housekeepers_General'], true)) {
                $target = 'Housekeepers';
            }
            if ($target === 'Unit') {
                $target = 'Client';
            }
            if (in_array($target, ['Client', 'Owners2', 'Guest', 'Housekeepers'], true)) {
                $transaction->setAllocationTarget($target);
            }
        }

        // If no allocationTarget was provided, map legacy default 'Unit' to 'Client'
        if ($transaction->getAllocationTarget() === 'Unit') {
            $transaction->setAllocationTarget('Client');
        }

        // Unit & City mapping
        if (array_key_exists('unitId', $data)) {
            if ($data['unitId']) {
                $unit = $em->getRepository('App\\Entity\\Unit')->find($data['unitId']);
                if ($unit) {
                    $transaction->setUnit($unit);
                    // When a unit is set, city must mirror the unit's city, except if the unit is the special Housekeepers unit
                    $isHousekeepersUnit = method_exists($unit, 'getUnitName') && $unit->getUnitName() === 'Housekeepers';
                    if (!$isHousekeepersUnit && method_exists($unit, 'getCity')) {
                        $transaction->setCity($unit->getCity());
                    }
                } else {
                    // Invalid unit id – clear unit and let city fallback to payload (if any)
                    $transaction->setUnit(null);
                }
            } else {
                // Explicitly clearing unit
                $transaction->setUnit(null);
            }
        }

        // If there is no unit, or the unit is Housekeepers, accept and validate incoming city
        $unit = $transaction->getUnit();
        $isHousekeepersUnit = $unit && method_exists($unit, 'getUnitName') && $unit->getUnitName() === 'Housekeepers';
        if ($transaction->getUnit() === null || $isHousekeepersUnit) {
            if (array_key_exists('city', $data)) {
                $incomingCity = $data['city'];
                if ($incomingCity === null || $incomingCity === '') {
                    $transaction->setCity(null);
                } elseif (in_array($incomingCity, self::ALLOWED_CITIES, true)) {
                    $transaction->setCity($incomingCity);
                } else {
                    // If invalid, set null here; controller will 400 on validation
                    $transaction->setCity(null);
                }
            } // else leave existing city as-is (useful for PUT when not changing city)
        }

        // (allocationTarget enforcement for Housekeepers unit removed per new model)

        // Enforce costCentre (internal bucket) based on city
        // Requested mapping:
        //  - Tulum => HK_Tulum
        //  - Playa del Carmen => HK_Playa
        //  - General/other => HK_General
        // Note: City has already been finalized above (normal units mirror Unit.city; Housekeepers unit uses payload city).
        $cityForCostCentre = $transaction->getCity();
        if ($cityForCostCentre === 'Playa del Carmen') {
            $transaction->setCostCentre('HK_Playa');
        } elseif ($cityForCostCentre === 'Tulum') {
            $transaction->setCostCentre('HK_Tulum');
        } else {
            $transaction->setCostCentre('HK_General');
        }

        // (Final guard for allocationTarget === 'Unit' removed per new model)
    }

    #[Route('/{id}', name: 'delete', methods: ['DELETE'])]
    public function delete(HKTransactions $transaction, EntityManagerInterface $em): JsonResponse
    {
        $em->remove($transaction);
        $em->flush();

        return $this->json(null, 204);
    }
}