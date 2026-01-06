<?php

namespace App\Controller\Api;

use App\Repository\SantanderEntryRepository;
use App\Service\SantanderBankImportService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

class SantanderEntryController extends AbstractController
{
    private SantanderBankImportService $importService;
    private SantanderEntryRepository $repository;
    private EntityManagerInterface $em;

    public function __construct(
        SantanderBankImportService $importService,
        SantanderEntryRepository $repository,
        EntityManagerInterface $em
    ) {
        $this->importService = $importService;
        $this->repository = $repository;
        $this->em = $em;
    }

    /**
     * Import a Santander XLSX statement into santander_entry.
     *
     * This is intended to be used from a UI similar to AccountingRecords,
     * under a "Santander" tab. For v1 we only care about credit (Deposito)
     * rows; debits can be ignored.
     */
    #[Route(
        path: '/api/accounting/santander/import',
        name: 'api_accounting_santander_import',
        methods: ['POST']
    )]
    public function import(Request $request): JsonResponse
    {
        /** @var UploadedFile|null $file */
        $file = $request->files->get('file');

        if (!$file instanceof UploadedFile) {
            return new JsonResponse([
                'success' => false,
                'error' => 'No file uploaded',
            ], 400);
        }

        $accountLast4 = $request->request->get('accountLast4');
        if ($accountLast4 !== null) {
            $accountLast4 = trim((string) $accountLast4);
        }

        $sourceFileName = $file->getClientOriginalName();

        try {
            $path = $file->getPathname();
            $result = $this->importService->importFile($path, $accountLast4, $sourceFileName);

            return new JsonResponse([
                'success' => true,
                'result' => $result,
            ]);
        } catch (\Throwable $e) {
            return new JsonResponse([
                'success' => false,
                'error' => 'Failed to import Santander statement: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Update a single Santander entry (e.g. checked flag and notes).
     */
    #[Route(
        path: '/api/accounting/santander/{id}',
        name: 'api_accounting_santander_update',
        methods: ['PATCH']
    )]
    public function updateEntry(int $id, Request $request): JsonResponse
    {
        $entry = $this->repository->find($id);
        if (!$entry) {
            return new JsonResponse([
                'success' => false,
                'error' => 'Entry not found',
            ], 404);
        }

        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            $data = [];
        }

        $hasChanges = false;

        if (array_key_exists('checked', $data)) {
            $entry->setChecked((bool) $data['checked']);
            $hasChanges = true;
        }

        if (array_key_exists('notes', $data)) {
            $notes = $data['notes'];
            if ($notes !== null) {
                $notes = trim((string) $notes);
            }
            $entry->setNotes($notes !== '' ? $notes : null);
            $hasChanges = true;
        }

        if ($hasChanges) {
            if (method_exists($entry, 'setUpdatedAt')) {
                $entry->setUpdatedAt(new \DateTimeImmutable());
            }
            $this->em->flush();
        }

        return new JsonResponse([
            'success' => true,
            'item' => [
                'id' => $entry->getId(),
                'checked' => $entry->isChecked(),
                'notes' => $entry->getNotes(),
            ],
        ]);
    }

    /**
     * (Optional) Simple list endpoint for Santander credits, primarily for debugging
     * or an initial Santander tab view. Can be extended later with filters and pagination.
     */
    #[Route(
        path: '/api/accounting/santander/credits',
        name: 'api_accounting_santander_credits',
        methods: ['GET']
    )]
    public function listCredits(Request $request): JsonResponse
    {
        $accountLast4 = $request->query->get('accountLast4');
        if ($accountLast4 !== null) {
            $accountLast4 = trim((string) $accountLast4);
        }

        $onlyUnchecked = $request->query->getBoolean('unchecked', false);

        // Optional year/month filters coming from the UI (AccountingRecords YearMonthPicker)
        $year = (int) $request->query->get('year', 0);
        $month = (int) $request->query->get('month', 0);

        // Determine date range: if year/month provided, use that month.
        // Otherwise, default to the previous calendar month.
        if ($year > 0 && $month > 0 && $month <= 12) {
            try {
                $from = new \DateTimeImmutable(sprintf('%04d-%02d-01', $year, $month));
                $to = $from->modify('first day of next month');
            } catch (\Exception $e) {
                // Fallback to previous month if bad input
                $today = new \DateTimeImmutable('today');
                $firstOfThis = $today->modify('first day of this month');
                $from = $firstOfThis->modify('-1 month');
                $to = $firstOfThis;
            }
        } else {
            $today = new \DateTimeImmutable('today');
            $firstOfThis = $today->modify('first day of this month');
            $from = $firstOfThis->modify('-1 month');
            $to = $firstOfThis;
        }

        // Build query: only deposits (credits), within [from, to), optional account and checked filter.
        $qb = $this->repository->createQueryBuilder('e')
            ->andWhere('e.fechaOn >= :from')
            ->andWhere('e.fechaOn < :to')
            ->andWhere('e.deposito IS NOT NULL')
            ->andWhere('e.deposito > 0')
            ->setParameter('from', $from)
            ->setParameter('to', $to)
            ->orderBy('e.fechaOn', 'DESC');

        if ($accountLast4) {
            $qb->andWhere('e.accountLast4 = :last4')
               ->setParameter('last4', $accountLast4);
        }

        if ($onlyUnchecked) {
            $qb->andWhere('e.checked = 0');
        }

        // Safety limit to avoid huge payloads; one month should already be small.
        $qb->setMaxResults(500);

        $entries = $qb->getQuery()->getResult();

        $data = array_map(static function ($e) {
            return [
                'id' => $e->getId(),
                'accountLast4' => $e->getAccountLast4(),
                'fechaOn' => $e->getFechaOn() ? $e->getFechaOn()->format('Y-m-d') : null,
                'hora' => $e->getHora() ? $e->getHora()->format('H:i:s') : null,
                'concept' => $e->getConcept(),
                'retiro' => $e->getRetiro(),
                'deposito' => $e->getDeposito(),
                'moneda' => $e->getMoneda(),
                'checked' => $e->isChecked(),
                'createdAt' => $e->getCreatedAt() ? $e->getCreatedAt()->format('Y-m-d H:i:s') : null,
                'updatedAt' => $e->getUpdatedAt() ? $e->getUpdatedAt()->format('Y-m-d H:i:s') : null,
                'sourceFileName' => $e->getSourceFileName(),
                'notes' => $e->getNotes(),
            ];
        }, $entries);

        return new JsonResponse([
            'success' => true,
            'items' => $data,
        ]);
    }
}
